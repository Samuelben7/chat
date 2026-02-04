import re

# Ler o arquivo
with open('app/api/bot_builder.py', 'r') as f:
    content = f.read()

# Padrão 1: db antes de empresa_id
pattern1 = r'(\n\s+)(db: Session = Depends\(get_db\),)\n(\s+)(empresa_id: CurrentEmpresa)'
replacement1 = r'\1empresa_id: CurrentEmpresa,\n\3db: Session = Depends(get_db)'
content = re.sub(pattern1, replacement1, content)

# Padrão 2: outros params antes de empresa_id
pattern2 = r'(\n\s+)([^:]+: [^,\n]+,)\n(\s+)(db: Session = Depends\(get_db\),)\n(\s+)(empresa_id: CurrentEmpresa)'
replacement2 = r'\1empresa_id: CurrentEmpresa,\n\3\2\n\5db: Session = Depends(get_db)'
content = re.sub(pattern2, replacement2, content)

# Escrever de volta
with open('app/api/bot_builder.py', 'w') as f:
    f.write(content)

print("Arquivo corrigido!")
