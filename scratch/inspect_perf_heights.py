with open('public/performance_analytics.html', 'r', encoding='utf-8') as f:
    content = f.read()

import re
style_blocks = re.findall(r'<style>(.*?)</style>', content, re.DOTALL)
if style_blocks:
    styles = style_blocks[0]
    for line in styles.split('\n'):
        if any(x in line for x in ['height', 'padding', 'margin', 'card', 'box-shadow', 'overflow']):
            print(line.strip())
