# Refatoração da Tela de Templates

## Objetivos Alcançados
- **Layout Profissional:** Criada uma estrutura de duas colunas (Formulário e Preview) com sidebar colapsável, seguindo o padrão de plataformas SaaS como Notion e Linear.
- **Design Premium:** Interface totalmente reconstruída com Tailwind CSS, usando sombras suaves (`shadow-sm`), bordas arredondadas (`rounded-xl`), e foco claro nos inputs.
- **Funcionalidades Preservadas:** Todas as funcionalidades (Listagem, Criação, Edição, Preview, Envio, Sincronização) foram mantidas e reorganizadas.
- **Builder Flexível:** Adicionado seletor de formato que alterna dinamicamente entre o editor padrão e o construtor de carrossel.
- **Preview Fixo:** A coluna da direita agora é fixa (`sticky top-6`), garantindo que o preview esteja sempre visível durante a edição.

## Próximos Passos (Sugestão)
- Se desejar, podemos refinar ainda mais os componentes visuais criando arquivos separados para cada card (ex: `TemplateFormGeneral.tsx`, `TemplateFormContent.tsx`).
- Adicionar validação em tempo real com feedback visual nos inputs (atualmente usamos `alert`).
