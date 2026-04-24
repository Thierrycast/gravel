# Ideia: The Vault (Segurança e Privacidade)

Foco em transformar o Gravel em um ambiente seguro para uso em locais compartilhados (casa/escritório).

## 1. Vault Lockscreen
- **Bloqueio por Inatividade:** Opcional. Bloqueia a interface após X minutos.
- **Senha Mestre:** Senha única para destravar o app. Não é um "login" de nuvem, mas uma trava local.
- **Panic Key:** Atalho de teclado para ocultar valores e deslogar instantaneamente.

## 2. Criptografia Local
- **Encryption at Rest:** Criptografar as colunas `metadataJson` no banco SQLite usando AES-256, com chave derivada da Senha Mestre.
- **Mascaramento de Chaves:** Chaves de API nunca devem ser exibidas em texto claro após salvas.

## 3. Stealth Mode
- **Filtro de Privacidade:** Contexto global que aplica `blur` ou substitui por `***` todos os valores monetários em todas as páginas com um clique.
