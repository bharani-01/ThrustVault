import requests
from bs4 import BeautifulSoup

url = 'https://www.kdedirect.com/products/kde4215xf-465'
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0'
}
r = requests.get(url, headers=headers, timeout=20)
soup = BeautifulSoup(r.text, 'html.parser')

print("H1 tags:")
for h1 in soup.find_all('h1'):
    print(f"  H1: {h1} | class: {h1.get('class')} | text: {h1.get_text(strip=True)}")

print("Page title tag:")
if soup.title:
    print(f"  Title: {soup.title.text}")
