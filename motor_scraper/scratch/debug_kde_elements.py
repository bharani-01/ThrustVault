import requests
from bs4 import BeautifulSoup

url = 'https://www.kdedirect.com/products/kde4215xf-465'
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0'
}
r = requests.get(url, headers=headers, timeout=20)
soup = BeautifulSoup(r.text, 'html.parser')

print("Title:", soup.title.string if soup.title else None)

og_title = soup.find('meta', property='og:title')
if og_title:
    print("og:title:", og_title.get('content'))

print("All elements with class containing 'title' or 'name':")
for el in soup.find_all(class_=True):
    classes = el.get('class', [])
    if any('title' in c or 'name' in c for c in classes):
        print(f"  {el.name}.{'.'.join(classes)}: {el.get_text(strip=True)[:60]}")
