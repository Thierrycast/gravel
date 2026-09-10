# Integração

Este documento existe para ser lido por quem — pessoa ou agente — vai encaixar o kit num app
específico. A ordem importa: o contrato do servidor primeiro, porque é o que mais quebra; depois o
passo a passo do seu stack; depois as armadilhas, que estão **junto da coisa que elas mordem** em
vez de numa lista no fim.

---

## O contrato do servidor

Base padrão: `http://HOST:8010`. Autenticação por `Authorization: Bearer <chave>`, opcional — numa
tailnet costuma não ter chave nenhuma.

### `GET /health`
Diz se está de pé. Chame antes de habilitar os botões de voz: sem isto, botão morto sem explicação.

```json
{ "ok": true, "kokoro": true, "vosk": true, "version": "2.6.0",
  "stt_streams": { "active": 0, "limit": 6 },
  "stt_gate": { "active": 0, "waiting": 0, "limit": 2 } }
```

`stt_streams.active` é a primeira coisa a olhar quando o texto ao vivo não conecta.

### `GET /voices`
Lista as vozes **com o id que o servidor aceita de fato**.

> **Armadilha.** Existe também `/voices/names`, e ela parece mais simples. Não use: devolve só as
> vozes do motor padrão, as do piper ficam de fora, e sem o prefixo do motor (`piper:`) o servidor
> recusa com *"Unknown voice"*. O kit já usa `/voices` e cai para `/voices/names` só como último
> recurso.

> **Escolha a voz por velocidade, não por timbre.** A resposta traz `metrics.short.ratio`: quanto
> tempo o servidor leva para gerar em relação à duração do áudio. Acima de 1 ele perde para o
> relógio e a fala chega sempre atrasada. Medido: **piper 0,58×**, **kokoro 2,04×**. `listVoices`
> já devolve ordenado da mais rápida para a mais lenta — mostre nessa ordem, com o número visível,
> senão o usuário escolhe a bonita e conclui que o app é lento.

### `POST /v1/audio/transcriptions`
`multipart/form-data` com `file` (WAV), `model`, `language`. Devolve `{ "text": "..." }`.
É a transcrição **autoritativa**.

### `POST /v1/audio/speech`
`{ input, model, voice }` → áudio completo. Use como fallback.

### `POST /tts/stream`
`{ text, voice }` → corpo em streaming, WAV. É o que faz a resposta começar a tocar antes de
terminar de ser gerada.

> **O cabeçalho WAV chega no primeiro pedaço e traz a taxa real.** Assumir 22.050 Hz dá áudio
> acelerado ou arrastado conforme a voz. O kit lê os 44 bytes e só então começa a agendar.

### `WS /stt/stream`
PCM **s16le, mono, 16 kHz** em quadros binários. Controle e respostas em JSON de texto.

```
cliente → { "type": "config", "sample_rate": 16000, "words": false }
cliente → <quadro binário PCM>  (qualquer tamanho; o servidor reagrupa em blocos de 250 ms)
cliente → { "type": "eof" }

servidor → { "type": "ready",   "sample_rate": 16000 }
servidor → { "type": "partial", "text": "hipótese em andamento" }
servidor → { "type": "final",   "text": "segmento fechado" }
servidor → { "type": "done",    "text": "texto completo", "segments": [...] }
servidor → { "type": "error",   "message": "..." }
```

> ### 🔴 A armadilha que quase enterrou o recurso
>
> **O `ready` não vem depois do `config`. Vem depois do primeiro quadro de áudio.**
>
> A primeira versão do cliente enfileirava o áudio esperando o `ready` — o que qualquer
> implementação razoável faria. Resultado: o cliente esperava permissão, o servidor esperava som, e
> nenhum parcial chegava nunca. Não havia erro, log, nem timeout: só silêncio.
>
> **Mande o `config` e comece a empurrar áudio imediatamente.** O `ready` serve só para saber que a
> conexão vingou. O exemplo em Python do próprio servidor faz assim — foi lendo o exemplo que o bug
> apareceu.

> **`final` quase nunca chega; `done` é o que fecha.** Um trecho de três segundos fecha sem nenhum
> `final` e só emite `done` no `eof`. Trate os dois como texto fechado, ou o seu `onFinal` nunca
> dispara e o estado do rascunho nunca limpa.

> **Código de fechamento 1013 = as seis conexões estão ocupadas.** Não reconecte em laço: só piora
> a fila. O kit avisa e desiste.

> **O servidor fecha depois de 120 s sem áudio.** Numa conversa isso é normal — a pessoa fica
> calada. Por isso o orçamento de três reconexões do kit conta **tempo de vida da conexão**, não
> número de tentativas: uma conexão que viveu 10 s e caiu não gasta orçamento. Zerar o contador no
> `ready` não resolveria, porque o `ready` só chega quando alguém fala, que é exatamente o que não
> estava acontecendo.

---

## Configuração mínima

```ts
{
  endpoint: { baseUrl: "http://<host-do-lab>:8010", apiKey: "" },
  models: {
    transcription: "groq/whisper-large-v3-turbo",
    speech: "tts-1",
  },
  voice: "piper:pt_BR-cadu-medium",     // com prefixo do motor, sempre
  streamingUrl: "ws://<host-do-lab>:8010/stt/stream",   // vazio desliga o texto ao vivo
  streamSpeech: true,                    // toca enquanto gera
  language: "pt",
}
```

O `streamingUrl` vazio é um caminho de primeira classe, não um erro: o app funciona inteiro sem
texto ao vivo, só sem o rascunho na tela.

---

## Os callbacks

| callback | quando | o que fazer |
|---|---|---|
| `onTranscript(texto)` | enunciado fechado e transcrito | **abrir um turno.** É o único que importa de verdade. |
| `onPartial(texto)` | a cada ~250 ms enquanto se fala | mostrar como rascunho. **Nunca** tratar como comando. |
| `onState(estado)` | mudou de estado | passar ao visual; é o que troca cor e ritmo. |
| `onMetrics(m, estado)` | ~20×/s | alimentar o visual. Em React, **não** guarde em estado. |
| `onError(msg)` | falha que o usuário precisa ver | mostrar. Já vem em português, pronto para a tela. |
| `onTrace(evento, dados)` | diagnóstico | opcional. Sem ele o kit é silencioso — nada de `console.log` fixo. |

### O ciclo de um turno falado

```
usuário fala
  → onState("listening")      o orb fica azul
  → onPartial(...) × N        o rascunho aparece e muda
  → onTranscript(texto)       ◄── VOCÊ ENTRA AQUI
  → onState("thinking")       o orb fica roxo
        seu app chama o modelo
  → voz.speak(resposta)
  → onState("speaking")       o orb fica âmbar e reage ao áudio DELA
        supressão de eco ativa: o VAD suspenso, o stream não recebe áudio
  → onState("listening")      volta a ouvir, sem você fazer nada
```

---

## React (Vite, CRA)

Nada de especial. O `useVoiceSession` guarda a sessão num ref e nunca a recria — o microfone não
cai entre renders. Mudanças de endpoint, voz ou modelo entram por `configure` sem reabrir nada.

> **Não coloque as métricas em estado.** Elas chegam 20 vezes por segundo; em estado, cada amostra
> re-renderiza a árvore acima do orb e o app trava com uma animação bonita. O analisador devolve
> sempre o *mesmo objeto* mutado no lugar, então o hook expõe um **ref**, e o `<VoiceOrb>` lê o valor
> vivo dentro do próprio `requestAnimationFrame`. Se você precisa do número na tela (um medidor),
> copie para estado num intervalo lento — 4 Hz resolve.

---

## Next.js

O núcleo do `speech-api.ts` roda em qualquer lugar (é só `fetch`). O resto **não existe no
servidor**: `AudioContext`, `WebGL`, `window`, `navigator.mediaDevices`.

O `VoiceSession.start()` tem guarda de ambiente e falha com mensagem em vez de explodir, e o
`useVoiceSession` devolve uma sessão nula no servidor. Ainda assim:

```tsx
// app/components/Voz.tsx
"use client";
import { useVoiceSession, VoiceStage } from "voice-kit";
// ...
```

```tsx
// app/page.tsx — o import dinâmico evita até o parse do módulo no servidor
import dynamic from "next/dynamic";
const Voz = dynamic(() => import("./components/Voz"), { ssr: false });
```

> **Use `next/dynamic` com `ssr: false`, não só `"use client"`.** `"use client"` ainda faz o módulo
> ser avaliado no build/servidor em alguns caminhos, e `gl-visual.ts` cria um canvas de sonda no
> topo do módulo em algumas trilhas de código. Importação dinâmica é a garantia.

> **Importe fundo para não arrastar React ao bundle do servidor.** Se você só precisa da camada
> HTTP numa route handler — listar vozes, transcrever um upload — importe de
> `voice-kit/core/speech-api` em vez do índice. O índice reexporta React e visuais.

---

## Sem framework (Vue, Svelte, Angular, vanilla)

`voice-kit/vanilla` traz `VoiceSession` + `mountVoiceOrb`. Monte o orb num elemento, ligue os
callbacks, e chame `destroy()` quando o componente sair. O núcleo nunca dependeu de React.

---

## Outra extensão Chrome (MV3)

O kit **não** traz o adaptador de extensão — foi extraído justamente para se livrar dele. Se for
esse o seu caso, três coisas mudam:

1. **O runtime vai para um documento offscreen**, porque o service worker morre e leva o microfone.
   `chrome.offscreen.createDocument` com `reasons: ["USER_MEDIA"]`.
2. **Os callbacks viram mensagens.** `onPartial` → `chrome.runtime.sendMessage({ type: "voice:partial" })`,
   e o painel escuta. Foi assim na Vela.
3. **A permissão de microfone precisa ser concedida antes, numa página comum.** Documento offscreen
   **não consegue exibir o prompt** — `getUserMedia` falha calado e o botão parece quebrado. Ponha um
   botão "Permitir microfone" na página de opções.

O `worklet.ts` do kit resolve o quarto problema de graça: como o worklet vai embutido em Blob URL,
você não precisa de `chrome.runtime.getURL` nem declarar o arquivo em `web_accessible_resources`.

---

## Rede: CSP e CORS

> **Endpoint em HTTP puro precisa entrar na CSP.** Numa página HTTPS, `http://` é bloqueado como
> conteúdo misto. Numa extensão, `connect-src` do manifest tem de listar o host **e o `ws://`**:
>
> ```
> connect-src 'self' https: ws://<host-do-lab>:* wss: http://localhost:* http://127.0.0.1:*;
> ```
>
> Sem o `ws://` explícito, o WebSocket falha e o `onclose` não diz por quê.

> **CORS é do servidor.** Se o `fetch` do navegador falha e o `curl` funciona, é isto. A `speech-api`
> já libera; um servidor seu talvez não.

---

## Quando não funciona

Na ordem em que costuma ser:

1. **`GET /health` do navegador.** Se falhar aqui, é rede, CSP ou CORS — não é o kit.
2. **`stt_streams.active` no `/health`.** Se estiver em 6, conexões abandonadas estão ocupando as
   vagas; elas expiram em 120 s.
3. **`onTrace` ligado.** `"texto ao vivo conectado"` diz que o `ready` chegou. Se não chega, releia
   a armadilha do `ready` acima — é quase sempre ela.
4. **`onMounted` do `<VoiceOrb>`.** Se `fallback: true`, o shader não subiu e você está vendo o
   renderer 2D de reserva. "O orb não reage" e "o shader não compilou" parecem a mesma coisa na tela
   e têm causas opostas.
5. **A permissão do microfone.** `navigator.permissions.query({ name: "microphone" })`.

---

*Documentado por: Claude Code (Opus 5) — 2026-09-10.*
