import axios from 'axios';

export const register = async (username, email, password) => {
  const response = await axios.post('/api/auth/register', { username, email, password });
  return response.data;
};

export const verifyEmailOtp = async (email, otp) => {
  const response = await axios.post('/api/auth/verify-email-otp', { email, otp });
  return response.data;
};

export const resendEmailOtp = async (email) => {
  const response = await axios.post('/api/auth/resend-email-otp', { email });
  return response.data;
};
