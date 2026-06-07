import requests
import re
import urllib.parse

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
}

url = "https://www.bing.com/search?q=" + urllib.parse.quote("cleaning products wholesale Hyderabad")
res = requests.get(url, headers=headers, timeout=15)
print("Status:", res.status_code)

# find all h2 tags
h2s = re.findall(r'<h2[^>]*>.*?</h2>', res.text, re.DOTALL)
print("Found h2 tags:", len(h2s))
for h2 in h2s[:5]:
    print("H2:", re.sub(r'<[^>]+>', '', h2).strip())

# find all links that look like result links
# Let's see if there are links containing "justdial" or others
for term in ["justdial", "indiamart", "tradeindia", "wikipedia", "cleaning"]:
    print(f"Occurrences of '{term}':", res.text.lower().count(term))
