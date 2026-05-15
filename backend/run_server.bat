@echo off
cd /d "D:\Tool SMS\backend"
call venv\Scripts\activate
uvicorn main:app --host 0.0.0.0 --port 8001

