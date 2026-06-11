import os

def load_env(path='.env'):
    env = {}
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                env[k.strip()] = v.strip()
    return env

env = load_env()
print("SUPABASE_URL:", env.get("SUPABASE_URL"))
print("AUDIT_SUPABASE_URL:", env.get("AUDIT_SUPABASE_URL"))
print("Are they same?", env.get("SUPABASE_URL") == env.get("AUDIT_SUPABASE_URL"))
