import sqlite3
import os
import subprocess
CLIENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(CLIENT_DIR, 'leads_WHB0126.db')

if os.path.exists(DB_PATH):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Delete test lead
    cursor.execute("DELETE FROM leads WHERE phone = '919398317754'")
    
    # Delete orphan messages
    cursor.execute("DELETE FROM messages WHERE lead_id NOT IN (SELECT id FROM leads)")
    
    conn.commit()
    conn.close()
    print("Database cleaned successfully.")
    
    # Regenerate export JSON
    py_script = os.path.join(CLIENT_DIR, 'messaging.py')
    subprocess.run(['python', py_script, 'export'])
    print("Export JSON cleaned successfully.")
else:
    print("Database not found.")
