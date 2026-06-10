import sys
sys.path.insert(0, 'd:/motor data/motor_scraper')
from scrapers.google.kde_product_scraper import scrape_kde_product

motors, perf = scrape_kde_product('https://www.kdedirect.com/products/kde4215xf-465')

print('=== MOTOR SPECS ===')
m = motors[0] if motors else {}
for k, v in m.items():
    if v and k not in ('source','source_url','xlsx_url','link_motor','link_esc','link_propeller'):
        print(f'  {k:25} : {v}')

print(f'\n=== PERFORMANCE DATA ({len(perf)} points) ===')
if perf:
    print(f'{"Throttle%":>10} {"Voltage":>12} {"Current(A)":>12} {"Power(W)":>10} {"Thrust(g)":>12} {"Prop":<30}')
    print('-'*90)
    for pt in perf[:20]:
        print(f'{str(pt.get("throttle",""))+"%":>10} {str(pt.get("voltage","")):>12} '
              f'{str(pt.get("current","") or ""):>12} {str(pt.get("power","") or ""):>10} '
              f'{str(pt.get("thrust_g","") or ""):>12} {str(pt.get("prop",""))[:30]:<30}')
