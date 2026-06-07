import os
import sqlite3
import json
from datetime import datetime

CLIENT_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(CLIENT_DIR, 'leads_WHB0126.db')

TEMPLATES = {
    'email_cold': {
        'subject': 'Wholesale Chemical Supply Partnership for {company_name}',
        'body': (
            'Hi {first_name_placeholder},\n\n'
            'I hope this finds you well.\n\n'
            'I came across {company_name} while researching leading B2B hardware and chemical distributors in the {city/state} area.\n\n'
            'We specialize in supplying high-performance commercial cleaning chemicals, industrial degreasers, and janitorial supplies. Given your distribution footprint in {city/state}, I believe a partnership could help expand your product lines and boost margins.\n\n'
            'Are you available for a brief 10-minute call next Tuesday at 10 AM to discuss a potential trade partnership?\n\n'
            'Best regards,\n'
            '[Your Name]\n'
            'AutoVate'
        )
    },
    'email_followup': {
        'subject': 'Re: Wholesale Chemical Supply Partnership for {company_name}',
        'body': (
            'Hi {first_name_placeholder},\n\n'
            'I\'m following up on my previous email regarding a wholesale supply partnership with {company_name}.\n\n'
            'We\'ve recently launched a new line of high-demand eco-friendly disinfectants and degreasers that are seeing exceptional demand from B2B commercial buyers.\n\n'
            'Given your strong distribution presence in {city/state}, we would love to share our wholesale pricing catalog with your team.\n\n'
            'Do you have 5 minutes this week for a quick chat?\n\n'
            'Best regards,\n'
            '[Your Name]\n'
            'AutoVate'
        )
    },
    'linkedin': {
        'subject': None,
        'body': (
            'Hi {first_name_placeholder}, noticed {company_name} is a leading B2B hardware distributor in {city/state}. '
            'We specialize in wholesale cleaning chemicals and facility maintenance products. '
            'Would love to connect and explore trade synergy! - [Your Name]'
        )
    },
    'whatsapp': {
        'subject': None,
        'body': (
            'Hi {first_name_placeholder}! 👋 I hope you\'re having a great day. I came across {company_name} in {city/state} '
            'and saw you specialize in B2B hardware distribution.\n\n'
            'We supply bulk cleaning chemicals, degreasers, and disinfectants at competitive wholesale rates. 🚚 '
            'Would you be open to seeing our latest catalog? Let me know! 😊'
        )
    },
    'sms': {
        'subject': None,
        'body': (
            'Hi {first_name_placeholder}, this is [Your Name] from AutoVate. We supply wholesale commercial chemicals. '
            'Would love to chat about a partnership with {company_name} in {city/state}. Reply if interested!'
        )
    }
}

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def format_text(text, company_name, city_state, first_name="Purchasing Manager"):
    if not text:
        return None
    text = text.replace('{company_name}', company_name)
    text = text.replace('{city/state}', city_state)
    text = text.replace('{first_name_placeholder}', first_name)
    return text

def mark_sent(message_id):
    """Marks a message draft as sent and updates lead status to contacted."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT id, lead_id, channel FROM messages WHERE id = ?", (message_id,))
    msg = cursor.fetchone()
    if not msg:
        conn.close()
        return False, "Message not found."
    
    now_str = datetime.now().isoformat()
    cursor.execute(
        "UPDATE messages SET status = 'sent', sent_at = ? WHERE id = ?",
        (now_str, message_id)
    )
    
    lead_id = msg['lead_id']
    cursor.execute(
        "UPDATE leads SET status = 'contacted', contacted_at = ?, notes = COALESCE(notes, '') || '\nContacted via ' || ? || ' on ' || ? WHERE id = ?",
        (now_str, msg['channel'], now_str, lead_id)
    )
    
    conn.commit()
    conn.close()
    return True, f"Success: Message {message_id} marked as sent. Lead {lead_id} updated to 'contacted'."

def bulk_generate():
    """Generates drafts for all 5 channels for leads that do not have them yet."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Get leads that don't have any messages associated
    cursor.execute("""
        SELECT id, company_name, city, state 
        FROM leads 
        WHERE id NOT IN (SELECT DISTINCT lead_id FROM messages)
    """)
    leads = cursor.fetchall()
    
    drafts_created = 0
    for lead in leads:
        company_name = lead['company_name']
        city = lead['city']
        state = lead['state']
        
        if city and state:
            city_state = f"{city}, {state}"
        elif city:
            city_state = city
        elif state:
            city_state = state
        else:
            city_state = "your area"
            
        first_name = "Purchasing Manager" # default professional contact placeholder
        
        for channel, temp in TEMPLATES.items():
            subject = format_text(temp['subject'], company_name, city_state, first_name)
            body = format_text(temp['body'], company_name, city_state, first_name)
            
            cursor.execute("""
                INSERT INTO messages (lead_id, channel, direction, subject, body, status)
                VALUES (?, ?, 'outbound', ?, ?, 'draft')
            """, (lead['id'], channel, subject, body))
            drafts_created += 1
            
    conn.commit()
    conn.close()
    return drafts_created

def export_leads_json():
    """Exports all leads and their associated messages to a JSON file."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM leads")
    leads_rows = cursor.fetchall()
    
    leads_list = []
    for lead in leads_rows:
        lead_dict = dict(lead)
        
        cursor.execute("SELECT id, channel, direction, subject, body, status, sent_at FROM messages WHERE lead_id = ?", (lead['id'],))
        messages_rows = cursor.fetchall()
        lead_dict['messages'] = [dict(msg) for msg in messages_rows]
        
        leads_list.append(lead_dict)
        
    conn.close()
    
    export_path = os.path.join(CLIENT_DIR, 'leads_export.json')
    with open(export_path, 'w', encoding='utf-8') as f:
        json.dump(leads_list, f, indent=2)
        
    return export_path

def get_stats():
    """Retrieves lead generation and messaging statistics."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("SELECT COUNT(*) FROM leads")
    total_leads = cursor.fetchone()[0]
    
    cursor.execute("SELECT COUNT(*) FROM leads WHERE confidence_score >= 70")
    high_conf = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM leads WHERE confidence_score >= 50 AND confidence_score < 70")
    med_conf = cursor.fetchone()[0]
    cursor.execute("SELECT COUNT(*) FROM leads WHERE confidence_score >= 20 AND confidence_score < 50")
    low_conf = cursor.fetchone()[0]
    
    cursor.execute("SELECT status, COUNT(*) FROM leads GROUP BY status")
    leads_by_status = dict(cursor.fetchall())
    
    cursor.execute("SELECT source_url FROM leads")
    urls = [row[0] for row in cursor.fetchall()]
    sources_count = {"ThomasNet": 0, "Manta": 0, "YellowPages": 0, "Kompass": 0, "Other": 0}
    for url in urls:
        if not url:
            sources_count["Other"] += 1
        elif "thomasnet.com" in url:
            sources_count["ThomasNet"] += 1
        elif "manta.com" in url:
            sources_count["Manta"] += 1
        elif "yellowpages.com" in url:
            sources_count["YellowPages"] += 1
        elif "kompass.com" in url:
            sources_count["Kompass"] += 1
        else:
            sources_count["Other"] += 1
            
    cursor.execute("SELECT COUNT(*) FROM messages")
    total_messages = cursor.fetchone()[0]
    
    cursor.execute("SELECT status, COUNT(*) FROM messages GROUP BY status")
    messages_by_status = dict(cursor.fetchall())
    
    cursor.execute("SELECT channel, COUNT(*) FROM messages GROUP BY channel")
    messages_by_channel = dict(cursor.fetchall())
    
    cursor.execute("SELECT COUNT(*), SUM(results) FROM scrape_log")
    log_summary = cursor.fetchone()
    total_runs = log_summary[0] or 0
    total_results_logged = log_summary[1] or 0
    
    cursor.execute("SELECT source, keyword, errors, ran_at FROM scrape_log WHERE errors IS NOT NULL AND errors != 'None'")
    errors_logged = [dict(row) for row in cursor.fetchall()]
    
    conn.close()
    
    return {
        'total_leads': total_leads,
        'confidence': {
            'high': high_conf,
            'medium': med_conf,
            'low': low_conf
        },
        'leads_by_status': leads_by_status,
        'leads_by_source': sources_count,
        'total_messages': total_messages,
        'messages_by_status': messages_by_status,
        'messages_by_channel': messages_by_channel,
        'total_runs': total_runs,
        'total_results_logged': total_results_logged,
        'errors_logged': errors_logged
    }

def print_stats_summary():
    """Prints a formatted report of campaign statistics."""
    stats = get_stats()
    
    print("\n" + "="*50)
    print("      CLIENT WHB0126 - B2B OUTREACH CAMPAIGN SUMMARY")
    print("="*50)
    print(f"Total Leads Saved:        {stats['total_leads']}")
    print(f"  - High Confidence (70+): {stats['confidence']['high']}")
    print(f"  - Med Confidence (50-69):{stats['confidence']['medium']}")
    print(f"  - Low Confidence (20-49):{stats['confidence']['low']}")
    print("-"*50)
    print("Leads by Source Directory:")
    for src, count in stats['leads_by_source'].items():
        if count > 0:
            print(f"  - {src}: {count}")
    print("-"*50)
    print("Leads by Outreach Status:")
    for status, count in stats['leads_by_status'].items():
        print(f"  - {status.capitalize()}: {count}")
    print("-"*50)
    print(f"Total Message Drafts:     {stats['total_messages']}")
    print("Messages by Channel:")
    for chan, count in stats['messages_by_channel'].items():
        print(f"  - {chan:15}: {count}")
    print("Messages by Send Status:")
    for status, count in stats['messages_by_status'].items():
        print(f"  - {status.capitalize():15}: {count}")
    print("-"*50)
    print(f"Scraper Run Logs:         {stats['total_runs']} queries executed")
    if stats['errors_logged']:
        print(f"Errors Logged:           {len(stats['errors_logged'])} errors")
        for err in stats['errors_logged']:
            print(f"  - [{err['ran_at']}] {err['source']} ({err['keyword']}): {err['errors']}")
    else:
        print("Errors Logged:           None")
    print("="*50 + "\n")

if __name__ == '__main__':
    import sys
    if len(sys.argv) > 2 and sys.argv[1] == 'mark_sent':
        try:
            msg_id = int(sys.argv[2])
            success, msg = mark_sent(msg_id)
            print(msg)
        except ValueError:
            print("Error: Invalid message ID.")
    elif len(sys.argv) > 1 and sys.argv[1] == 'generate':
        count = bulk_generate()
        print(f"Generated {count} message drafts.")
    elif len(sys.argv) > 1 and sys.argv[1] == 'export':
        path = export_leads_json()
        print(f"Leads and messages successfully exported to {path}")
    else:
        print_stats_summary()
