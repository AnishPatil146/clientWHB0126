import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'leads_WHB0126.db')
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Insert test lead with real user number
cursor.execute("""
    INSERT OR IGNORE INTO leads (
        company_name, website, email, phone, city, state, country,
        description, products_focus, distributor_type, source_url, confidence_score
    ) VALUES (
        'Your Test Distributor',
        'https://www.yourtestdistributor.com',
        'sales@yourtestdistributor.com',
        '919398317754',
        'Mumbai',
        'MH',
        'India',
        'B2B wholesale distributor of industrial degreasers, solvents, and commercial cleaning chemicals.',
        'cleaning, chemical',
        'Wholesale Distributor',
        'https://www.thomasnet.com',
        95
    )
""")

conn.commit()
conn.close()
print("Successfully added test lead to WHB0126 database.")
