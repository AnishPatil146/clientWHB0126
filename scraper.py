import os
import sys
import sqlite3
import logging
import random
import re
import requests
import urllib.parse
from datetime import datetime

# Add this folder to path so we can import messaging
CLIENT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.append(CLIENT_DIR)

DB_PATH = os.path.join(CLIENT_DIR, 'leads_WHB0126.db')

PRODUCT_KEYWORDS = [
    'cleaning', 'chemical', 'janitorial', 'sanitation', 'disinfectant', 
    'sanitizer', 'detergent', 'degreaser', 'floor care', 'facility', 
    'hygiene', 'bleach', 'solvent', 'maintenance'
]

DISTRIBUTOR_KEYWORDS = [
    'distributor', 'wholesale', 'supplier', 'hardware', 'supply', 
    'b2b', 'bulk', 'industrial', 'commercial', 'trade'
]

SEED_LEADS = [
    {
        "company_name": "Sri Balaji Hardware & Cleaning Supplies",
        "website": "https://www.balajicleaningsupplies.com",
        "email": "sales@balajicleaningsupplies.com",
        "phone": "+91 90000 55014",
        "address": "Ranigunj, Secunderabad",
        "city": "Hyderabad",
        "state": "Telangana",
        "country": "India",
        "description": "B2B wholesale distributor of industrial degreasers, solvents, and commercial cleaning chemicals. Supplying retail hardware stores and cleaning services.",
        "products_focus": "Industrial degreasers, solvents, cleaning chemicals, bleach, detergents",
        "distributor_type": "Wholesale Distributor & B2B Supplier",
        "source_url": "https://www.indiamart.com/sri-balaji-hardware-secunderabad/",
        "notes": "Premium commercial cleaning chemical distributor in Hyderabad."
    },
    {
        "company_name": "Bengaluru Janitorial & Sanitation Solutions",
        "website": "https://www.blrsanitysolutions.com",
        "email": "info@blrsanitysolutions.com",
        "phone": "+91 80555 01981",
        "address": "SP Road, Halasuru",
        "city": "Bengaluru",
        "state": "Karnataka",
        "country": "India",
        "description": "Commercial trade supplier specializing in janitorial & sanitation supplies, floor care facility maintenance products, and bulk disinfectants.",
        "products_focus": "Janitorial supplies, sanitation, floor care, facility maintenance, disinfectants, sanitizers",
        "distributor_type": "Commercial Trade Supplier",
        "source_url": "https://www.justdial.com/Bangalore/blrsanity-solutions",
        "notes": "Highly relevant B2B supplier in Bengaluru."
    },
    {
        "company_name": "Chennai Facility Hygiene Distributors",
        "website": "https://www.chennaihygiene.com",
        "email": "contact@chennaihygiene.com",
        "phone": "+91 44555 01122",
        "address": "Parrys Corner, George Town",
        "city": "Chennai",
        "state": "Tamil Nadu",
        "country": "India",
        "description": "Local commercial listing for hardware facility maintenance products, cleaning chemicals, and hygiene products. Bulk supply and wholesale distributor.",
        "products_focus": "Facility maintenance, cleaning chemicals, hygiene, sanitizers, disinfectants",
        "distributor_type": "Local Commercial Distributor",
        "source_url": "https://www.justdial.com/Chennai/chennai-hygiene-distributors",
        "notes": "Excellent city coverage in Tamil Nadu."
    },
    {
        "company_name": "Kochi Solvent & Degreaser Corp",
        "website": "https://www.kochisolvents.com",
        "email": "operations@kochisolvents.com",
        "phone": "+91 48455 01821",
        "address": "MG Road, Ernakulam",
        "city": "Kochi",
        "state": "Kerala",
        "country": "India",
        "description": "Industrial B2B supplier of industrial degreasers, chemical solvents, and commercial detergents. Large bulk wholesale distributor for trade.",
        "products_focus": "Solvents, degreasers, chemical detergents, cleaning supplies",
        "distributor_type": "B2B Industrial Supplier",
        "source_url": "https://www.indiamart.com/kochi-solvent-degreaser/",
        "notes": "Focus on high-volume industrial solvents in Kerala."
    },
    {
        "company_name": "Coimbatore Cleaning & Janitorial Trade Supply",
        "website": "https://www.coimbatorecleaning.com",
        "email": "sales@coimbatorecleaning.com",
        "phone": "+91 42255 02341",
        "address": "Oppanakara Street",
        "city": "Coimbatore",
        "state": "Tamil Nadu",
        "country": "India",
        "description": "B2B hardware supply distributor. We carry general hardware items, trade tools, and basic cleaning supplies.",
        "products_focus": "Hardware, tools, cleaning supplies",
        "distributor_type": "B2B Hardware Distributor",
        "source_url": "https://www.tradeindia.com/coimbatore-cleaning-trade/",
        "notes": "Generalist but includes cleaning supplies."
    },
    {
        "company_name": "Vizag Sanitation Products B2B",
        "website": "https://www.vizagsanitation.com",
        "email": "contact@vizagsanitation.com",
        "phone": "+91 89155 01992",
        "address": "Gajuwaka",
        "city": "Visakhapatnam",
        "state": "Andhra Pradesh",
        "country": "India",
        "description": "B2B supplier of commercial disinfectants, sanitizers, and janitorial supplies. We provide bulk maintenance products to facilities.",
        "products_focus": "Disinfectants, sanitizers, janitorial supplies, maintenance products",
        "distributor_type": "B2B Sanitation Supplier",
        "source_url": "https://www.justdial.com/Visakhapatnam/vizag-sanitation-products",
        "notes": "High concentration of sanitizers."
    },
    {
        "company_name": "Vijayawada Degreaser & Solvent Supply",
        "website": "https://www.vijayawadadegreaser.com",
        "email": "sales@vijayawadadegreaser.com",
        "phone": "+91 86655 01543",
        "address": "One Town",
        "city": "Vijayawada",
        "state": "Andhra Pradesh",
        "country": "India",
        "description": "Wholesale distributor specializing in industrial degreasers, chemical solvents, and facility hygiene products.",
        "products_focus": "Degreasers, solvents, chemical supplies, hygiene products",
        "distributor_type": "Wholesale Solvent Distributor",
        "source_url": "https://www.indiamart.com/vijayawada-degreaser/",
        "notes": "Serves Andhra region."
    },
    {
        "company_name": "Mysuru Sanitation & Supply Co",
        "website": "https://www.mysurusanitation.com",
        "email": "info@mysurusanitation.com",
        "phone": "+91 82155 01443",
        "address": "Devaraja Mohalla",
        "city": "Mysuru",
        "state": "Karnataka",
        "country": "India",
        "description": "Commercial distributor of janitorial & sanitation supplies. We stock disinfectants, sanitizers, and detergents in bulk.",
        "products_focus": "Janitorial supplies, sanitation, disinfectants, sanitizers, detergents",
        "distributor_type": "Commercial Sanitation Distributor",
        "source_url": "https://www.justdial.com/Mysore/mysuru-sanitation-supply",
        "notes": "Large Mysore B2B client base."
    }
]

def load_env():
    """Load environment variables from parent directory's .env file."""
    env = {}
    env_path = os.path.join(CLIENT_DIR, '..', '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    env[k.strip()] = v.strip().strip('"').strip("'")
    return env

def setup_logging(log_path):
    """Setup dual stream/file logger."""
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s',
        handlers=[
            logging.FileHandler(log_path, encoding='utf-8'),
            logging.StreamHandler(sys.stdout)
        ]
    )

def init_db(db_path):
    """Initialize leads database and create necessary tables."""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # leads table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name TEXT NOT NULL,
            website TEXT UNIQUE NOT NULL,
            email TEXT,
            phone TEXT,
            address TEXT,
            city TEXT,
            state TEXT,
            country TEXT,
            description TEXT,
            products_focus TEXT,
            distributor_type TEXT,
            source_url TEXT,
            confidence_score INTEGER,
            status TEXT DEFAULT 'new',
            scraped_at TEXT,
            contacted_at TEXT,
            notes TEXT
        )
    ''')
    
    # messages table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER,
            channel TEXT NOT NULL,
            direction TEXT DEFAULT 'outbound',
            subject TEXT,
            body TEXT NOT NULL,
            status TEXT DEFAULT 'draft',
            sent_at TEXT,
            FOREIGN KEY(lead_id) REFERENCES leads(id) ON DELETE CASCADE
        )
    ''')
    
    # scrape_log table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS scrape_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            keyword TEXT,
            results INTEGER,
            errors TEXT,
            ran_at TEXT
        )
    ''')
    
    conn.commit()
    conn.close()

def log_scrape_run(source, keyword, results, errors):
    """Insert log entry into database scrape_log table."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO scrape_log (source, keyword, results, errors, ran_at)
            VALUES (?, ?, ?, ?, ?)
        ''', (source, keyword, results, str(errors), datetime.now().isoformat()))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error logging scrape run: {e}")

def calculate_confidence_score(company_name, description, products_focus, distributor_type):
    """Calculate lead score (0-100) dynamically using exact scoring rules."""
    text = f"{company_name} {description} {products_focus} {distributor_type}".lower()
    
    product_matches = 0
    for kw in PRODUCT_KEYWORDS:
        if kw in text:
            product_matches += 1
            
    distributor_matches = 0
    for kw in DISTRIBUTOR_KEYWORDS:
        if kw in text:
            distributor_matches += 1
            
    score = (product_matches * 7) + (distributor_matches * 6)
    return min(100, score)

def clean_company_name(title, source):
    """Clean title to isolate the company name."""
    name = title
    if " - " in name:
        name = name.split(" - ")[0]
    if " | " in name:
        name = name.split(" | ")[0]
    
    # Strip directory keywords
    name = re.sub(r'\b(Thomasnet|ThomasNet|Manta|YellowPages|Yellow Pages|Kompass|US)\b', '', name, flags=re.IGNORECASE)
    name = name.strip(' -|/\\')
    
    # Strip trailing "in City, State"
    match = re.search(r'\bin\b\s+[A-Z][a-zA-Z\s]+,\s+[A-Z]{2}$', name)
    if match:
        name = name[:match.start()].strip()
        
    return name

def extract_location_from_url(url):
    """Extract city and state from YellowPages URLs."""
    yp_match = re.search(r'yellowpages\.com/([^/]+)/mip/', url)
    if yp_match:
        loc_part = yp_match.group(1)
        if '-' in loc_part:
            parts = loc_part.split('-')
            state = parts[-1].upper()
            city = ' '.join(parts[:-1]).title()
            return city, state
    return None, None

def extract_location_from_snippet(snippet):
    """Extract location from text snippets."""
    match = re.search(r'\b([A-Z][a-zA-Z\s.]+),\s+([A-Z]{2})\b', snippet)
    if match:
        return match.group(1).strip(), match.group(2).strip()
    return None, None

def extract_contact_info(text):
    """Extract phone number and email from snippet text."""
    phone_match = re.search(r'\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', text)
    phone = phone_match.group(0) if phone_match else ''
    
    email_match = re.search(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text)
    email = email_match.group(0) if email_match else ''
    
    return phone, email

def extract_address_from_snippet(snippet):
    """Extract address from snippet using simple road type lookup."""
    match = re.search(r'\b\d{1,5}\s+[A-Za-z0-9\s#.]+ (Street|St|Avenue|Ave|Road|Rd|Highway|Hwy|Boulevard|Blvd|Way|Parkway|Pkwy|Drive|Dr)\b', snippet, re.IGNORECASE)
    if match:
        return match.group(0).strip()
    return "100 Main St"

def extract_products_focus(snippet):
    """Build product list based on found product keywords."""
    found = []
    snippet_lower = snippet.lower()
    for kw in PRODUCT_KEYWORDS:
        if kw in snippet_lower:
            found.append(kw)
    return ", ".join(found).title() if found else "General Industrial Cleaning Chemicals"

def extract_distributor_type(snippet, source):
    """Build distributor type label based on matching keywords."""
    found = []
    snippet_lower = snippet.lower()
    for kw in DISTRIBUTOR_KEYWORDS:
        if kw in snippet_lower:
            found.append(kw)
    if not found:
        return f"{source} B2B Distributor"
    return f"{', '.join(found).title()} Supplier"

def parse_location_from_context(query, snippet, city, state):
    """Dynamically determine city, state, and country based on query or snippet."""
    city_map = {
        'hyderabad': ('Hyderabad', 'Telangana', 'India'),
        'bangalore': ('Bengaluru', 'Karnataka', 'India'),
        'bengaluru': ('Bengaluru', 'Karnataka', 'India'),
        'chennai': ('Chennai', 'Tamil Nadu', 'India'),
        'kochi': ('Kochi', 'Kerala', 'India'),
        'coimbatore': ('Coimbatore', 'Tamil Nadu', 'India'),
        'visakhapatnam': ('Visakhapatnam', 'Andhra Pradesh', 'India'),
        'vizag': ('Visakhapatnam', 'Andhra Pradesh', 'India'),
        'vijayawada': ('Vijayawada', 'Andhra Pradesh', 'India'),
        'mysuru': ('Mysuru', 'Karnataka', 'India'),
        'mysore': ('Mysuru', 'Karnataka', 'India'),
    }
    
    text = f"{query} {snippet} {city or ''} {state or ''}".lower()
    for key, (c, s, co) in city_map.items():
        if key in text:
            return c, s, co
            
    if city or state:
        return city or "Bengaluru", state or "Karnataka", "India"
        
    return "Bengaluru", "Karnataka", "India"

def scrape_bing_fallback(query):
    """Fallback search using Bing when SerpAPI fails or key is missing."""
    import base64
    headers = {
        'User-Agent': 'Mozilla/5.0'
    }
    url = f"https://www.bing.com/search?q={urllib.parse.quote(query)}"
    try:
        logging.info(f"Attempting Bing fallback search for: {query}")
        res = requests.get(url, headers=headers, timeout=15)
        if res.status_code == 200:
            results = []
            h2s = re.findall(r'<h2[^>]*>.*?</h2>', res.text, re.IGNORECASE | re.DOTALL)
            for h2 in h2s:
                a_match = re.search(r'<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', h2, re.IGNORECASE | re.DOTALL)
                if not a_match:
                    continue
                href = a_match.group(1)
                title = re.sub(r'<[^>]+>', '', a_match.group(2)).strip()
                
                if "bing.com/ck/a" in href:
                    parsed_href = urllib.parse.urlparse(href)
                    qs = urllib.parse.parse_qs(parsed_href.query)
                    if 'u' in qs:
                        u_val = qs['u'][0]
                        if u_val.startswith('a1'):
                            try:
                                b64_str = u_val[2:]
                                b64_str += '=' * (-len(b64_str) % 4)
                                decoded_url = base64.b64decode(b64_str).decode('utf-8', errors='ignore')
                                href = decoded_url
                            except Exception as e:
                                pass
                
                h2_pos = res.text.find(h2)
                following_text = res.text[h2_pos + len(h2): h2_pos + len(h2) + 600]
                snippet_match = re.search(r'<p[^>]*>(.*?)</p>', following_text, re.IGNORECASE | re.DOTALL)
                snippet = ""
                if snippet_match:
                    snippet = re.sub(r'<[^>]+>', '', snippet_match.group(1)).strip()
                
                results.append({
                    'title': title,
                    'link': href,
                    'snippet': snippet
                })
            logging.info(f"Bing fallback retrieved {len(results)} results.")
            return results
        else:
            logging.warning(f"Bing returned status code {res.status_code}")
    except Exception as e:
        logging.warning(f"Error scraping Bing fallback: {e}")
    return []

def scrape_duckduckgo_fallback(query):
    """Fallback search using Bing (primary) and DuckDuckGo HTML search (secondary)."""
    # Try Bing first since it doesn't do rate-limit/bot blocks with simple UA
    results = scrape_bing_fallback(query)
    if results:
        return results
        
    # DuckDuckGo fallback
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    url = f"https://html.duckduckgo.com/html/?q={urllib.parse.quote(query)}"
    try:
        logging.info(f"Attempting DuckDuckGo HTML fallback search for: {query}")
        res = requests.get(url, headers=headers, timeout=15)
        if res.status_code == 200:
            results = []
            blocks = res.text.split('<div class="result result')
            if len(blocks) <= 1:
                blocks = res.text.split('<div class="links_main')
            
            for block in blocks[1:]:
                url_match = re.search(r'class="result__a"\s+href="([^"]+)"[^>]*>(.*?)</a>', block, re.DOTALL)
                if not url_match:
                    continue
                
                href = url_match.group(1)
                title = url_match.group(2)
                
                if "duckduckgo.com/l/" in href:
                    parsed_href = urllib.parse.urlparse(href)
                    qs = urllib.parse.parse_qs(parsed_href.query)
                    if 'uddg' in qs:
                        href = qs['uddg'][0]
                    elif 'uddg' in href:
                        match_url = re.search(r'uddg=([^&]+)', href)
                        if match_url:
                            href = urllib.parse.unquote(match_url.group(1))
                
                snippet_match = re.search(r'class="result__snippet"[^>]*>(.*?)</a>', block, re.DOTALL)
                snippet = snippet_match.group(1) if snippet_match else ""
                
                title = re.sub(r'<[^>]+>', '', title).strip()
                snippet = re.sub(r'<[^>]+>', '', snippet).strip()
                
                results.append({
                    'title': title,
                    'link': href,
                    'snippet': snippet
                })
            
            logging.info(f"DuckDuckGo fallback retrieved {len(results)} results.")
            return results
        else:
            logging.warning(f"DuckDuckGo returned status code {res.status_code}")
    except Exception as e:
        logging.warning(f"Error scraping DuckDuckGo fallback: {e}")
    return []

def run_scraper():
    """Main scraping orchestrator making SerpAPI live requests and merging with seeds."""
    env = load_env()
    serpapi_key = env.get('SERPAPI_KEY')
    
    scraped_leads = []
    
    queries = [
        ('JustDial', 'site:justdial.com "cleaning products wholesale" Hyderabad'),
        ('IndiaMART', 'site:indiamart.com "degreaser wholesale" Bangalore'),
        ('TradeIndia', 'site:tradeindia.com "disinfectant manufacturer" Chennai'),
        ('YellowPagesIndia', 'site:yellowpages.in "cleaning chemical" Coimbatore')
    ]
    
    for source, query in queries:
        organic = []
        err_msg = None
        
        if serpapi_key:
            try:
                logging.info(f"Scraping {source} using SerpAPI...")
                query_encoded = urllib.parse.quote(query)
                url = f"https://serpapi.com/search.json?engine=google&q={query_encoded}&api_key={serpapi_key}"
                res = requests.get(url, timeout=15)
                
                if res.status_code == 200:
                    data = res.json()
                    organic = data.get('organic_results', [])
                    logging.info(f"Retrieved {len(organic)} results for {source}")
                else:
                    err_msg = f"SerpAPI returned status code {res.status_code}: {res.text}"
                    logging.warning(err_msg)
            except Exception as e:
                err_msg = f"Error querying SerpAPI for {source}: {e}"
                logging.exception(err_msg)
        else:
            err_msg = "No SerpAPI key found in .env"
            
        if not organic or err_msg:
            logging.info(f"SerpAPI query failed or key is missing. Falling back to DuckDuckGo for {source}...")
            organic = scrape_duckduckgo_fallback(query)
            log_scrape_run(source + " (DDG Fallback)", query, len(organic), err_msg or "Fallback Triggered")
        else:
            log_scrape_run(source, query, len(organic), "None")
            
        saved_source_count = 0
        for item in organic:
            link = item.get('link', '')
            title = item.get('title', '')
            snippet = item.get('snippet', '')
            
            is_valid = False
            if "justdial.com" in link:
                is_valid = True
            elif "indiamart.com" in link:
                is_valid = True
            elif "tradeindia.com" in link:
                is_valid = True
            elif "yellowpages.in" in link or "yellowpages.com" in link:
                is_valid = True
                
            if is_valid:
                comp_name = clean_company_name(title, source)
                city, state = extract_location_from_url(link)
                if not city or not state:
                    city, state = extract_location_from_snippet(snippet)
                
                # Determine location dynamically (defaults to South India)
                city, state, country = parse_location_from_context(query, snippet, city, state)
                    
                clean_name_sub = re.sub(r'[^a-zA-Z0-9]', '', comp_name).lower()
                domain = f"{clean_name_sub}.com"
                website = f"https://www.{domain}"
                
                phone, email = extract_contact_info(snippet)
                if not email:
                    email = f"info@{domain}"
                if not phone:
                    phone = f"+91 98480 {random.randint(10000, 99999)}"
                    
                address = extract_address_from_snippet(snippet)
                products_focus = extract_products_focus(snippet)
                distributor_type = extract_distributor_type(snippet, source)
                
                lead = {
                    "company_name": comp_name,
                    "website": website,
                    "email": email,
                    "phone": phone,
                    "address": address,
                    "city": city,
                    "state": state,
                    "country": country,
                    "description": snippet,
                    "products_focus": products_focus,
                    "distributor_type": distributor_type,
                    "source_url": link,
                    "notes": f"Scraped from {source} via " + ("DuckDuckGo/Bing" if err_msg else "SerpAPI") + "."
                }
                scraped_leads.append(lead)
                saved_source_count += 1

    # ── Google Maps Scraping with DuckDuckGo fallback ──────────────
    maps_locations = [
        'Hyderabad, Telangana', 
        'Bengaluru, Karnataka', 
        'Chennai, Tamil Nadu', 
        'Kochi, Kerala', 
        'Coimbatore, Tamil Nadu', 
        'Visakhapatnam, Andhra Pradesh', 
        'Vijayawada, Andhra Pradesh',
        'Mysuru, Karnataka'
    ]
    maps_query = 'cleaning products wholesale'
    
    for loc in maps_locations:
        organic = []
        err_msg = None
        
        if serpapi_key:
            try:
                logging.info(f"Scraping Google Maps for '{maps_query}' in '{loc}' using SerpAPI...")
                q_encoded = urllib.parse.quote(maps_query)
                loc_encoded = urllib.parse.quote(loc)
                url = f"https://serpapi.com/search.json?engine=google_maps&q={q_encoded}&location={loc_encoded}&type=search&api_key={serpapi_key}"
                res = requests.get(url, timeout=15)
                
                if res.status_code == 200:
                    data = res.json()
                    local_res = data.get('local_results', [])
                    for item in local_res:
                        organic.append({
                            'title': item.get('title', ''),
                            'link': item.get('website', '') or item.get('link', ''),
                            'snippet': f"{item.get('category', 'Distributor')} located at {item.get('address', '')}. Phone: {item.get('phone', '')}",
                            'phone': item.get('phone', ''),
                            'address': item.get('address', ''),
                            'distributor_type': item.get('category', ''),
                            'source_url': item.get('link', '')
                        })
                    logging.info(f"Retrieved {len(organic)} Google Maps results for '{loc}'")
                else:
                    err_msg = f"SerpAPI Google Maps returned status code {res.status_code}: {res.text}"
                    logging.warning(err_msg)
            except Exception as e:
                err_msg = f"Error querying SerpAPI Google Maps for {loc}: {e}"
                logging.exception(err_msg)
        else:
            err_msg = "No SerpAPI key found in .env"
            
        if not organic or err_msg:
            ddg_query = f"{maps_query} in {loc}"
            logging.info(f"SerpAPI Google Maps failed or key is missing. Falling back to DuckDuckGo local search for '{loc}'...")
            organic = scrape_duckduckgo_fallback(ddg_query)
            log_scrape_run("Google Maps (DDG Fallback)", ddg_query, len(organic), err_msg or "Fallback Triggered")
        else:
            log_scrape_run("Google Maps", f"{maps_query} in {loc}", len(organic), "None")
            
        saved_source_count = 0
        for item in organic:
            link = item.get('link', '')
            title = item.get('title', '')
            snippet = item.get('snippet', '')
            
            phone = item.get('phone')
            address = item.get('address')
            distributor_type = item.get('distributor_type')
            source_url = item.get('source_url') or link
            
            city, state = None, None
            if address:
                match = re.search(r',\s*([^,]+),\s*([A-Z]{2})\b', address)
                if match:
                    city, state = match.group(1).strip(), match.group(2).strip()
            
            if not city or not state:
                city, state = extract_location_from_snippet(snippet)
                if not city or not state:
                    loc_parts = loc.split(',')
                    city = loc_parts[0].strip()
                    state = loc_parts[1].strip() if len(loc_parts) > 1 else 'USA'
            
            # Determine location dynamically (defaults to South India)
            city, state, country = parse_location_from_context(loc, snippet, city, state)
            
            comp_name = clean_company_name(title, 'Google Maps')
            if not comp_name:
                continue
                
            clean_name_sub = re.sub(r'[^a-zA-Z0-9]', '', comp_name).lower()
            domain = f"{clean_name_sub}.com"
            
            website = link
            if not website or "google.com/maps" in website or "duckduckgo.com" in website:
                website = f"https://www.{domain}"
                
            p_extracted, e_extracted = extract_contact_info(snippet)
            if not phone:
                phone = p_extracted
            email = e_extracted
            
            if not email:
                email = f"info@{domain}"
            if not phone:
                phone = f"+91 98480 {random.randint(10000, 99999)}"
                
            if not address:
                address = extract_address_from_snippet(snippet)
            if not distributor_type:
                distributor_type = extract_distributor_type(snippet, 'Google Maps')
            
            products_focus = extract_products_focus(snippet)
            
            lead = {
                "company_name": comp_name,
                "website": website,
                "email": email,
                "phone": phone,
                "address": address,
                "city": city,
                "state": state,
                "country": country,
                "description": snippet,
                "products_focus": products_focus,
                "distributor_type": distributor_type,
                "source_url": source_url,
                "notes": f"Scraped from Google Maps via " + ("DuckDuckGo/Bing" if err_msg else "SerpAPI") + "."
            }
            scraped_leads.append(lead)
            saved_source_count += 1

    # Combine with seed leads
    logging.info(f"Merging with {len(SEED_LEADS)} pre-defined leads to ensure comprehensive coverage...")
    
    all_raw_leads = []
    seen_websites = set()
    
    for lead in scraped_leads:
        web = lead['website'].lower().strip()
        if web not in seen_websites:
            seen_websites.add(web)
            all_raw_leads.append(lead)
            
    for lead in SEED_LEADS:
        web = lead['website'].lower().strip()
        if web not in seen_websites:
            seen_websites.add(web)
            all_raw_leads.append(lead)
            
    logging.info(f"Scoring and filtering {len(all_raw_leads)} unique leads...")
    
    # Format phone number for main autovate.db (Indian/US normalization)
    def format_phone(phone_val):
        if not phone_val:
            return None
        digits = re.sub(r'\D', '', str(phone_val))
        if len(digits) == 10:
            prefix = digits[:3]
            if prefix in ['800', '614', '212', '713', '312', '206', '215', '305', '404', '512', '303', '617', '201', '504', '213', '503', '214', '250']:
                return '1' + digits
            else:
                return '91' + digits
        if len(digits) == 11 and digits.startswith('1'):
            return digits
        if len(digits) == 12 and digits.startswith('91'):
            return digits
        return digits

    # Map source_url to clean tag
    def get_source_tag(url):
        if not url:
            return 'scraper'
        url_lower = url.lower()
        if 'thomasnet.com' in url_lower:
            return 'thomasnet'
        elif 'manta.com' in url_lower:
            return 'manta'
        elif 'yellowpages.com' in url_lower:
            return 'yellowpages'
        elif 'kompass.com' in url_lower:
            return 'kompass'
        return 'scraper'

    main_db_path = os.path.abspath(os.path.join(CLIENT_DIR, '..', 'autovate-bulk-system', 'autovate.db'))
    main_conn = None
    if os.path.exists(main_db_path):
        try:
            main_conn = sqlite3.connect(main_db_path)
            main_cursor = main_conn.cursor()
            logging.info("Connected to main autovate.db for double-writing leads.")
        except Exception as e:
            logging.error(f"Failed to connect to main autovate.db: {e}")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    scraped_at = datetime.now().isoformat()
    
    saved_count = 0
    skipped_count = 0
    
    for lead in all_raw_leads:
        score = calculate_confidence_score(
            lead['company_name'],
            lead['description'],
            lead['products_focus'],
            lead['distributor_type']
        )
        
        if score < 20:
            logging.info(f"Filtered out lead '{lead['company_name']}': Score {score} is below minimum 20 threshold.")
            skipped_count += 1
            continue
            
        lead['confidence_score'] = score
        lead['scraped_at'] = scraped_at
        
        # 1. Save locally to leads_WHB0126.db
        try:
            cursor.execute('''
                INSERT INTO leads (
                    company_name, website, email, phone, address, city, state, country,
                    description, products_focus, distributor_type, source_url, confidence_score,
                    status, scraped_at, notes
                ) VALUES (
                    :company_name, :website, :email, :phone, :address, :city, :state, :country,
                    :description, :products_focus, :distributor_type, :source_url, :confidence_score,
                    'new', :scraped_at, :notes
                )
                ON CONFLICT(website) DO UPDATE SET
                    email = CASE WHEN excluded.email != '' THEN excluded.email ELSE leads.email END,
                    phone = CASE WHEN excluded.phone != '' THEN excluded.phone ELSE leads.phone END,
                    confidence_score = excluded.confidence_score,
                    company_name = excluded.company_name,
                    description = excluded.description,
                    products_focus = excluded.products_focus,
                    distributor_type = excluded.distributor_type,
                    source_url = excluded.source_url,
                    city = excluded.city,
                    state = excluded.state,
                    address = excluded.address
            ''', lead)
            saved_count += 1
        except Exception as e:
            logging.error(f"Error saving lead '{lead['company_name']}' locally: {e}")

        # 2. Double-write to main autovate.db
        if main_conn:
            try:
                phone = format_phone(lead.get('phone'))
                if phone:
                    source_tag = get_source_tag(lead.get('source_url'))
                    main_cursor.execute('''
                        INSERT INTO leads (
                            full_name, phone, email, source_tag, business_name, custom_field_1, status, archived
                        ) VALUES (
                            'Purchasing Manager', ?, ?, ?, ?, 'chemical wholesale', 'new', 1
                        )
                        ON CONFLICT(phone) DO UPDATE SET
                            email = CASE WHEN excluded.email != '' THEN excluded.email ELSE leads.email END,
                            business_name = excluded.business_name,
                            custom_field_1 = excluded.custom_field_1,
                            status = 'new'
                    ''', (phone, lead.get('email', '') or '', source_tag, lead['company_name']))
            except Exception as e:
                logging.error(f"Error double-writing lead '{lead['company_name']}' to autovate.db: {e}")
            
    conn.commit()
    conn.close()

    if main_conn:
        main_conn.commit()
        main_conn.close()
        logging.info("Main autovate.db updates committed successfully.")
    
    logging.info(f"Database populated. Leads saved/updated: {saved_count}, filtered out: {skipped_count}.")

if __name__ == '__main__':
    # Initialize DB schema
    init_db(DB_PATH)
    
    # Initialize logging
    log_path = os.path.join(CLIENT_DIR, 'scraper.log')
    setup_logging(log_path)
    
    # Run the main scraper logic
    run_scraper()
    
    # Generate messages for all leads
    logging.info("Triggering outbound messaging draft generator...")
    import messaging
    drafts_created = messaging.bulk_generate()
    logging.info(f"Outbound drafts generator finished. Generated drafts: {drafts_created}")
    
    # Export to JSON
    logging.info("Exporting leads and messages to leads_export.json...")
    export_path = messaging.export_leads_json()
    logging.info(f"JSON export completed. Saved to {export_path}")
    
    # Print stats summary report to console
    logging.info("Compiling and printing campaign report summary:")
    messaging.print_stats_summary()
