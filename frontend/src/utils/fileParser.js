import Papa from 'papaparse';
import * as XLSX from 'xlsx';

/**
 * Normalize raw phone number input to a clean string.
 * IMPORTANT: Phone numbers must ALWAYS be treated as strings.
 *            Never use Number() or parseInt() — it will strip leading zeros.
 *
 * @param {*} value - Raw value from Excel/CSV/TXT (may be number, string, etc.)
 * @returns {string} Cleaned phone string with only digits and optional leading +
 */
export function normalizePhoneNumber(value) {
  if (value === null || value === undefined) return '';

  // Force to string first — Excel may pass numbers
  return String(value)
    .trim()
    .replace(/\s+/g, '')       // Remove all whitespace
    .replace(/[^\d+]/g, '');   // Keep only digits and +
}

/**
 * Clean and optionally fix a phone number.
 *
 * Rules:
 *   - If it starts with +84 followed by 9 digits → valid Vietnamese international format
 *   - If it has 10 digits starting with 0 → valid Vietnamese format
 *   - If it has exactly 9 digits and starts with 3/5/7/8/9 → likely missing leading 0
 *     (Excel strips leading zeros when storing as number). Auto-fix by prepending 0.
 *   - All other formats are returned as-is for validation to decide.
 *
 * @param {*} phone - Raw phone value
 * @returns {string|null} Cleaned phone string, or null if empty
 */
export function cleanPhoneNumber(phone) {
  if (!phone) return null;

  let cleaned = normalizePhoneNumber(phone);
  if (!cleaned) return null;

  // Fix: Excel stores phone numbers as numbers, stripping leading 0.
  // Vietnamese mobile: 10 digits starting with 0 (03x, 05x, 07x, 08x, 09x)
  // If we see exactly 9 digits starting with a valid VN mobile prefix → add 0
  if (/^[35789]\d{8}$/.test(cleaned)) {
    console.warn(
      `[fileParser] Phone "${phone}" looks like a Vietnamese number missing leading 0. Auto-correcting to "0${cleaned}".`
    );
    cleaned = '0' + cleaned;
  }

  return cleaned;
}

/**
 * Validate that a phone number is acceptable for sending.
 * Accepts:
 *   - 10 digits (Vietnamese local format, e.g. 0901234567)
 *   - +84 followed by 9 digits (Vietnamese international format, e.g. +84901234567)
 *   - 8-15 digits with optional leading + (international numbers)
 *
 * @param {string} phone - Cleaned phone number string
 * @returns {boolean}
 */
export function isValidPhone(phone) {
  if (!phone) return false;
  // Accept: 10-digit VN, +84XXXXXXXXX, or general international (8-15 digits)
  return /^\+?\d{8,15}$/.test(phone);
}

/**
 * Identify mobile network operator based on phone prefix.
 * @param {string} phone 
 * @returns {string} Network name or 'Khác'
 */
export function getNetworkOperator(phone) {
  if (!phone) return 'Khác';
  let p = phone;
  if (p.startsWith('+84')) p = '0' + p.slice(3);
  if (p.startsWith('84')) p = '0' + p.slice(2);
  
  const prefix3 = p.substring(0, 3);
  
  const networks = {
    'Viettel': ['086', '096', '097', '098', '032', '033', '034', '035', '036', '037', '038', '039'],
    'VinaPhone': ['088', '091', '094', '083', '084', '085', '081', '082'],
    'MobiFone': ['089', '090', '093', '070', '079', '077', '076', '078'],
    'Vietnamobile': ['092', '056', '058'],
    'Gmobile': ['099', '059'],
    'Itelecom': ['087'],
    'Wintel': ['055']
  };

  for (const [network, prefixes] of Object.entries(networks)) {
    if (prefixes.includes(prefix3)) return network;
  }
  
  return 'Khác';
}

// Xử lý đọc file CSV / TXT / EXCEL
export function parseFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

    reader.onload = (e) => {
      let numbers = [];
      try {
        if (isExcel) {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          // Chuyển đổi sheet sang dạng mảng các mảng (mỗi row là mảng cell)
          // raw: true → giữ nguyên giá trị gốc, tránh Excel tự convert số
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true });
          
          // Trích xuất số điện thoại (giả định nằm ở cột đầu tiên)
          numbers = jsonData
            .map(row => row[0])
            .filter(val => val !== undefined && val !== null && String(val).trim() !== '');
            
          resolve(processNumbers(numbers));
        } else {
          const text = e.target.result;
          
          // Nếu là CSV
          if (file.name.endsWith('.csv')) {
            Papa.parse(text, {
              complete: (results) => {
                numbers = results.data
                  .map(row => row[0])
                  .filter(val => val !== undefined && val !== null && String(val).trim() !== '');
                resolve(processNumbers(numbers));
              },
              error: (err) => reject(err),
            });
          } 
          // Nếu là TXT (mỗi dòng một số)
          else if (file.name.endsWith('.txt')) {
            numbers = text.split('\n')
              .filter(line => line.trim() !== '');
            resolve(processNumbers(numbers));
          } else {
            reject(new Error('Định dạng file không hỗ trợ.'));
          }
        }
      } catch (err) {
        reject(new Error('Lỗi khi phân tích tệp: ' + err.message));
      }
    };

    reader.onerror = () => reject(new Error('Lỗi khi đọc file.'));
    
    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  });
}

function processNumbers(rawNumbers) {
  const valid = [];
  const invalid = [];
  const validSet = new Set(); // Để lọc trùng

  rawNumbers.forEach((raw) => {
    const rawStr = String(raw).trim();
    if (!rawStr) return;

    const cleaned = cleanPhoneNumber(rawStr);
    
    if (isValidPhone(cleaned)) {
      // COMMENTED OUT FOR TESTING: Cho phép nhập số trùng lặp khi test
      // if (!validSet.has(cleaned)) {
      //   validSet.add(cleaned);
        const network = getNetworkOperator(cleaned);
        valid.push({ phone: cleaned, network });
      // }
    } else {
      invalid.push(rawStr);
    }
  });

  return {
    valid,
    invalid,
    totalParsed: rawNumbers.length
  };
}
