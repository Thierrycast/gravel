# Voice Kit

Conversa por voz de verdade: microfone aberto, texto aparecendo enquanto a pessoa fala, resposta
sintetizada tocando enquanto ainda é gerada, e um visual que reage ao áudio de forma que diz **o
que está acontecendo** — não só que algo está.

Extraído da Vela (extensão Chrome) depois de o stack estar rodando e verificado. Cada decisão aqui
foi paga em bug, e os comentários no código dizem qual — isso não é enfeite, é o que impede a
próxima integração de refazer o mesmo erro.

## O que ele faz

- **Ditado** — você fala, o texto cai no campo. Um turno por vez.
- **Voz ao vivo** — conversa contínua: ela ouve, transcreve, responde falando, e volta a ouvir sem
  você tocar em nada. Com supressão de eco, senão ela transcreve a própria resposta.
- **Texto ao vivo** — as palavras aparecem enquanto você fala, em vez de a tela ficar em branco
  até a frase acabar. É o que faz a pessoa não repetir o pedido achando que o microfone falhou.
- **Sete visuais reativos ao áudio** — shaders WebGL e canvas 2D, com estado, cor e ritmo próprios.
  O sétimo é escrito por você.

## O que ele não faz

Não tem modelo de linguagem, não gerencia conversa, não tem UI de chat. Ele entrega texto e recebe
texto: o que fica no meio é o seu app.

## Arquitetura em uma página

```
  microfone
     │
     ▼
  AudioWorklet ──── blocos de 20 ms (320 amostras @ 16 kHz)
     │
     ├──► VoiceMetricsAnalyzer ──► métricas ──► visual (orb reagindo)
     │
     ├──► UtteranceSegmenter (VAD) ──► enunciado fechado ──► WAV
     │                                                        │
     │                                                        ▼
     │                                        POST /v1/audio/transcriptions
     │                                                        │
     │                                                        ▼
     │                                          onTranscript  ← TEXTO AUTORITATIVO
     │                                                             │
     └──► SttStream (WebSocket) ──► parciais ──► onPartial          │  seu app responde
                                    ↑ RASCUNHO, nunca comando      │
                                                                   ▼
                                      speak(resposta) ──► POST /tts/stream
                                                                   │
                                     áudio agendado na linha do tempo do AudioContext
                                                                   │
                                            supressão de eco (speakingUntil)
```

### A divisão de trabalho que faz isso funcionar

São **dois caminhos de transcrição ao mesmo tempo**, e a tentação é escolher um. Não escolha:

| | quem | papel |
|---|---|---|
| **Stream** | Vosk, `/stt/stream` | escreve na tela. Muda enquanto se fala. **Nunca abre um turno.** |
| **Lote** | Whisper, `/v1/audio/transcriptions` | decide. É o texto que o app obedece. |

O áudio sai duas vezes de propósito. Numa rede local isso custa quase nada, e a alternativa — dar o
comando ao rascunho — troca latência por erro de interpretação. Medido contra o servidor real: para
*"abrir o site do banco e clicar em extrato"*, o Vosk entregou *"...e querer carinha extrato"*. Isso
viraria uma ação errada, com confiança.

## Estrutura

```
src/
├── core/           sem framework, sem React. É o motor.
│   ├── voice-session.ts   ◄── comece por aqui: orquestra tudo
│   ├── speech-api.ts       HTTP do servidor de voz
│   ├── stt-stream.ts       WebSocket dos parciais
│   ├── vad.ts              segmentação por silêncio
│   ├── audio-metrics.ts    FFT, bandas, envelope
│   ├── wav-encoder.ts      Float32 → WAV
│   ├── worklet.ts          o AudioWorklet, embutido como string
│   └── motion-tokens.ts    os nove estados
├── visuals/        canvas e WebGL. Sem React.
│   ├── gl-visual.ts        prelúdio GLSL, ShaderVisual, paleta por estado
│   ├── voice-visuals.ts    os sete visuais atrás de uma interface só
│   └── orb-renderer.ts     o de reserva, em canvas 2D
├── react/          açúcar em cima dos dois
│   ├── use-voice-session.ts
│   ├── VoiceOrb.tsx        ◄── o visual reagindo ao áudio
│   ├── VoiceStage.tsx      o palco: orb grande + rascunho + controles
│   ├── VisualPicker.tsx    escolher visual vendo, não lendo
│   ├── ShaderEditor.tsx    o usuário escreve o próprio shader
│   └── icons.tsx           SVG inline; troque pelos seus
└── vanilla.ts       o mesmo sem React
```

## Quickstart

### React (Vite, CRA)

```tsx
import { useVoiceSession, VoiceStage } from "voice-kit";

function Conversa() {
  const [foco, setFoco] = useState(true);
  const voz = useVoiceSession({
    endpoint: { baseUrl: "http://<host-do-lab>:8010", apiKey: "" },
    models: { transcription: "groq/whisper-large-v3-turbo", speech: "tts-1" },
    voice: "piper:pt_BR-cadu-medium",
    streamingUrl: "ws://<host-do-lab>:8010/stt/stream",
    onTranscript: async (texto) => {
      const resposta = await meuModelo(texto);   // seu app entra aqui
      await voz.speak(resposta);
    },
  });

  if (!voz.open) return <button onClick={() => voz.start("live")}>Falar</button>;

  return <VoiceStage
    state={voz.state}
    metricsRef={voz.metricsRef}
    visual="liquid-blob"
    transcript={voz.partial}
    muted={voz.muted}
    focused={foco}
    onToggleFocus={() => setFoco((v) => !v)}
    onToggleMute={voz.toggleMute}
    onClose={voz.stop}
  />;
}
```

Falta o CSS — o kit só emite nomes de classe. Ponto de partida em [ADAPTACAO.md](./ADAPTACAO.md).

### Next.js

Mesmo código, mas o componente **precisa** ser client-only: `AudioContext`, `WebGL` e `window` não
existem no servidor. Ver [INTEGRACAO.md](./INTEGRACAO.md#nextjs).

### Sem framework

```ts
import { VoiceSession, mountVoiceOrb } from "voice-kit/vanilla";

const orb = mountVoiceOrb(document.querySelector("#orb")!, { visual: "soft-orb" });
const voz = new VoiceSession({
  endpoint: { baseUrl: "http://<host-do-lab>:8010", apiKey: "" },
  models: { transcription: "groq/whisper-large-v3-turbo", speech: "tts-1" },
  voice: "piper:pt_BR-cadu-medium",
  streamingUrl: "ws://<host-do-lab>:8010/stt/stream",
  handlers: {
    onState: (e) => orb.setState(e),
    onMetrics: (m) => orb.setMetrics(m),
    onPartial: (t) => { rascunho.textContent = t; },
    onTranscript: (t) => responder(t),
    onError: (msg) => console.warn(msg),
  },
});
await voz.start("live");
```

## Como instalar

Não está no npm. Duas formas:

1. **Copiar `src/`** para dentro do seu projeto. É o caminho mais simples e o que a maioria dos apps
   vai querer — são 19 arquivos TypeScript sem dependência de build.
2. **Apontar como dependência local**: `"voice-kit": "file:../voice-kit"` no `package.json`. Mantém
   uma fonte só, mas o seu bundler precisa transpilar TypeScript de fora de `src/`.

A única dependência é **React**, e só se você usar a camada `react/`. Nem biblioteca de ícones: os
quatro ícones são SVG inline em `react/icons.tsx`, substituíveis por prop.

## O servidor

O kit fala com a **`speech-api`** (Kokoro TTS + Vosk STT), que segue o padrão da OpenAI em
`/v1/audio/speech` e `/v1/audio/transcriptions`, mais `/health`, `/voices` e `/tts/stream`, e o
WebSocket `/stt/stream`. Qualquer servidor que responda esse mesmo contrato serve — o contrato
completo está em [INTEGRACAO.md](./INTEGRACAO.md#o-contrato-do-servidor).

## Estado desta extração

O stack **de origem** está verificado: protocolo medido contra o servidor real, e o caminho inteiro
exercitado dentro da extensão com microfone falso (parcial na tela em 1,6 s, sem erro de console).

O **kit em si** passa `tsc --noEmit` com `strict`, e é código copiado desse stack verificado com um
único componente reescrito (`voice-session.ts`, que trocou o transporte do Chrome por callbacks).
Mas ele **não foi executado ainda** — o primeiro teste real é no seu app. Digo isso na cara em vez
de deixar você descobrir.

Divergência conhecida: a Vela **não** consome este kit, mantém as próprias cópias. Se você corrigir
algo aqui, o mesmo arquivo lá continua com o defeito. Os espelhos são: `audio-metrics`,
`motion-tokens`, `vad`, `stt-stream`, `gl-visual`, `orb-renderer`, `voice-visuals`, `wav-encoder`,
`visual-picker`, `shader-editor`.

## Índice

- [INTEGRACAO.md](./INTEGRACAO.md) — passo a passo por stack, o contrato do servidor, e as
  armadilhas de protocolo que custaram dias.
- [ADAPTACAO.md](./ADAPTACAO.md) — trocar cor, forma e movimento sem quebrar o que faz o visual
  informar. Os sete visuais, o CSS de partida, e como escrever o seu.

---
*Extraído por: Claude Code (Opus 5) — 2026-09-10. Origem: `projetos/browser-ai`, commit `41f914e`.*
