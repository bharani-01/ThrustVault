import re

motors = [
    'T-Motor MN3508 KV380', 'T-Motor MN3510 KV360', 'T-Motor MN4010 KV370',
    'T-Motor MN4012 KV340', 'T-Motor MN5212 KV280', 'T-Motor AT4120 KV250',
    'T-Motor V3508 KV380',  'T-Motor MT4114 KV340', 'T-Motor F80 Pro KV100',
    'Tarot 4008', 'Foxtech 4008',
    'KDE4215XF-465', 'KDE4215XF-330', 'KDE3510XF-475',
    'KDE4014XF-380', 'KDE5215XF-330', 'KDE6213XF-185', 'KDE8218XF-120',
    'MAD 4006 IPE 380KV', 'MAD 4012 EEE 430KV', 'MAD 5008 EEE 170KV', 'MAD 5010 EEE 240KV',
    'MAD 5008 IPE V3 KV240', 'MAD 5010 EEE V2.0 KV200', 'MAD M6C10 EEE KV200',
    'T-Motor U5 KV400', 'T-Motor U7 V2.0 KV420', 'T-Motor U8 II PRO KV100',
    'T-Motor U10 Plus KV100', 'T-Motor U12 II KV120',
    'T-Motor P80 III KV100', 'T-Motor P120 KV60',
    'NIDICI 3115 900KV', 'SII-4020', 'X5220 IPE KV190',
    'SunnySky V5210 KV300', 'SunnySky X5212S KV320',
    'EMAX RS2205 2300KV', 'EMAX ECO 2207 2400KV',
    'Hobbywing XRotor 4215', 'Scorpion SII-4020',
]

def extract_stator(name):
    # Try patterns with prefix letters: MN3508, KDE4215, RS2205
    m = re.search(r'[A-Za-z]{1,4}(\d{2})(\d{2})', name)
    if m:
        return m.group(1), m.group(2), m.group(1)+m.group(2)
    # Bare 4-digit: 4008, 5010
    m = re.search(r'\b(\d{2})(\d{2})\b', name)
    if m:
        return m.group(1), m.group(2), m.group(1)+m.group(2)
    # X5220 style (5 digits)
    m = re.search(r'[A-Za-z](\d{2})(\d{2,3})', name)
    if m:
        return m.group(1), m.group(2)[:2], m.group(1)+m.group(2)[:2]
    return '?', '?', 'NONE'

def extract_kv(name):
    m = re.search(r'(?i)kv\s*(\d{2,5})', name)
    if m: return m.group(1)
    m = re.search(r'(\d{2,5})\s*kv', name, re.IGNORECASE)
    if m: return m.group(1)
    m = re.search(r'-(\d{3,4})$', name)  # KDE4215XF-465
    if m: return m.group(1)
    return '?'

def infer_thrust(d, h):
    """Rough thrust class from stator size."""
    try:
        d_mm, h_mm = int(d), int(h)
        stator_vol = d_mm * d_mm * h_mm  # proportional to torque
        if stator_vol < 8000:    return "< 1 kg"
        elif stator_vol < 15000: return "1–2 kg"
        elif stator_vol < 25000: return "2–4 kg"
        elif stator_vol < 40000: return "4–6 kg"
        elif stator_vol < 60000: return "6–9 kg"
        else:                    return "> 9 kg"
    except: return "?"

print(f"{'Motor Name':<35} | {'D':>4} | {'H':>4} | {'Code':<6} | {'KV':<6} | Thrust Class")
print('-' * 85)
for m in motors:
    d, h, code = extract_stator(m)
    kv = extract_kv(m)
    thrust = infer_thrust(d, h)
    print(f"{m:<35} | {d+'mm':>4} | {h+'mm':>4} | {code:<6} | {kv+'KV':>6} | {thrust}")
