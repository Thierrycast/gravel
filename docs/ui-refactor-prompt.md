Refatoração completa da UI do painel Gravel Finance.

Objetivo Estético: Terminal técnico/cyberpunk de alto nível, foco em dados e eficiência (não é um app consumer amigável).

Diretrizes Visuais:
1. **Dark UI e Contraste**: Fundos extremamente escuros (ex: bg-zinc-950 ou preto puro). Contraste marcante entre o fundo e os elementos de dados.
2. **Cores de Acento**: Cores vivas e saturadas (ex: Neon Cyan, Matrix Green, Alert Amber) usadas com extrema parcimônia. Apenas onde há hierarquia visual crítica ou status (ex: lucro/prejuízo). Cada cor deve ter uma função estrita, zero decoração.
3. **Tipografia**: Use fontes Monospace (ex: Geist Mono, JetBrains Mono, Fira Code) rigorosamente para tudo que for técnico, números, valores monetários, tabelas e labels. A fonte sans principal deve ser muito limpa (Inter).
4. **Minimalismo e Flat Design**: Zero sombras pesadas (sem drop-shadows felpudos). Zero gradientes decorativos. Bordas duras ou levemente arredondadas (rounded-sm no máximo). Linhas finas (border-zinc-800) para separar painéis.
5. **Densidade de Informação**: Alta densidade. O usuário quer ver muitos dados na tela simultaneamente sem rolar, mas com espaçamento matemático perfeito para evitar poluição visual.
6. **Gráficos (Recharts/Chart.js)**: Aprimorar os componentes de gráficos. Fundo transparente, linhas de grid sutis ou inexistentes, tooltips no estilo terminal (caixa preta com borda neon e fonte mono).
7. **Responsividade Universal**: Foco extremo do Ultrawide ao Mobile. Tabelas densas devem ter scroll horizontal perfeito no celular. O layout deve quebrar de forma graciosa e funcionar sem bugs no Safari (evitar gap/flex quirks antigos se houver).

Escopo da Tarefa:
- Atualizar `tailwind.config.ts` com as novas cores neon e variáveis dark.
- Reescrever os componentes de Dashboard e Transações (`app/transactions/page.tsx`, etc) para adotar este novo design system.
- Otimizar tabelas de dados para a estética terminal.
