# Adaptação

Como dar a cara do seu app ao kit sem quebrar o que faz o visual **informar** em vez de só decorar.

Esta é a parte que mais parece livre e mais tem regra escondida. Cada seção diz o que você pode
mudar à vontade e o que, se mudar, faz o recurso perder o sentido.

---

## Os sete visuais

Todos implementam a mesma interface (`VoiceVisual`), todos recebem o mesmo sinal de áudio e os
mesmos nove estados. Trocar de estética é trocar o `id`.

| id | nome | técnica | WebGL | quando usar |
|---|---|---|---|---|
| `particle-orb` | Orb de partículas | canvas 2D · 72 partículas orbitais | não | reserva universal; funciona em qualquer máquina |
| `ambient-edge` | Ambient Edge | canvas 2D · gradiente radial + blend aditivo | não | quando você **não** quer um objeto na tela — acende a moldura |
| `mesh-field` | Mesh Field | shader · focos gaussianos + domain warping | sim | fundo atrás do conteúdo, movimento lento |
| `soft-orb` | Soft Orb | shader · SDF de círculo + fBm na borda | sim | o clássico: uma esfera só, brilho interno |
| `liquid-blob` | Liquid Blob | shader · metaballs + smooth-min + domain warping | sim | o mais "vivo" dos sete; foi o default da Vela |
| `energy-field` | Energy Field | shader · fBm em cristas + domain warping | sim | aurora abstrata ocupando a tela, sem forma definida |
| `custom` | Seu shader | seu fragment, mesmo prelúdio | sim | quando nenhum dos seis é a sua marca |

```tsx
<VoiceOrb state={voz.state} metricsRef={voz.metricsRef} visual="liquid-blob" size={190} />
```

> **Deixe o usuário escolher, vendo.** `<VisualPicker>` mostra cada opção animada, passeando sozinha
> pelos estados com um sinal sintético. Uma lista de nomes — "Liquid Blob", "Energy Field" — não diz
> nada a ninguém. `hide={["ambient-edge"]}` tira as que não cabem numa miniatura.

> **Abaixo de 24 px o shader é desperdício** e o `<VoiceOrb>` usa o renderer 2D sozinho: nesse
> tamanho nenhum detalhe aparece e você paga um contexto WebGL por nada.

---

## A paleta por estado — **leia antes de trocar cor**

`STATE_MOOD` são nove triplas RGB (0–1). Trocar é uma linha:

```ts
import { setVoicePalette } from "voice-kit";

setVoicePalette({
  listening: [0.20, 0.58, 1.00],   // você falando
  speaking:  [1.00, 0.64, 0.20],   // ela falando
  thinking:  [0.60, 0.38, 0.94],
});
```

> ### 🔴 A regra que não se troca
>
> **Quem está falando é a informação mais importante da tela.** Por isso `listening` e `speaking`
> ficam em **extremos opostos de temperatura** — azul frio contra âmbar quente. Não é escolha
> estética: é o que permite saber de relance se o microfone está com você ou não, sem ler nada.
>
> A adaptação que dá errado é sempre a mesma: alguém pega a paleta da marca, que é toda azul e roxa,
> e escolhe dois azuis vizinhos. O visual continua bonito e **para de informar**. Se a sua marca não
> tem duas temperaturas, use a cor da marca em `listening` e o complementar dela em `speaking`.

Os outros sete estados são mais livres, mas dois têm convenção que vale manter: **`error` escuro e
dessaturado** (o vermelho da marca costuma ser vibrante demais e vira alarme), e **`complete` verde**,
porque é o único momento em que o visual pode comemorar.

---

## O caráter do movimento

Ritmo é só velocidade; o resto é o **jeito** de se mover. `STATE_CHARACTER` guarda isso:

| campo | o que faz |
|---|---|
| `pace` | velocidade do tempo interno |
| `spin` | gira o campo interno sem mexer na silhueta — é o que faz "pensando" parecer pensar |
| `inward` | **positivo contrai, negativo expande** |
| `turbulence` | agitação da superfície |
| `cohesion` | abaixo de 1 as partes se soltam — é como o erro se desfaz |
| `waveIn` / `waveOut` | onda entrando ou saindo |
| `bands` | faixas horizontais; usado em "pensando" |
| `shatter` | estilhaça; só o erro usa |

> **`inward` é a regra que carrega o sentido.** `listening` tem `+0.75`: você fala e a forma
> **absorve**. `speaking` tem `-0.65`: ela fala e a forma **emite**. Inverter esses dois sinais faz
> o visual mentir sobre a direção da conversa, e ninguém consegue apontar o porquê de parecer
> errado.

Valores atuais, para referência ao ajustar:

```
           pace   spin  inward  turb  cohesion
idle       0.40   0.08    0.00  0.22   1.00
listening  0.85   0.16   +0.75  0.38   1.00     ← absorve
thinking   1.30   1.00   +0.18  0.42   0.96     ← gira
speaking   1.00   0.32   −0.65  0.52   1.00     ← emite
acting     1.70   0.55   −0.28  0.85   0.90
waiting    0.55   0.04   +0.30  0.18   1.00
paused     0.20   0.00   +0.10  0.08   1.00     ← quase parado
error      0.55  −0.45   +0.15  1.00   0.50     ← se desfaz
complete   1.05   0.22   −0.42  0.30   1.00
```

---

## O envelope do áudio — por que não tremer

`audio-metrics.ts` faz FFT de 512, separa bass/mid/high, aplica um noise gate e então um envelope
com **attack 0.32 e release 0.12**.

> **Ligar volume direto em tamanho produz tremor de VU meter.** É esse estágio de suavização que dá
> a sensação de massa — a forma parece ter peso em vez de piscar. Se você mexer, mexa no attack
> primeiro e mantenha o release menor que ele: subir rápido e descer devagar é o que soa natural.

O `speaking` do metrics tem **hold de ~320 ms**, senão o visual pisca entre as sílabas da mesma
frase.

---

## Escrever o seu shader

O visual `custom` compila um fragment shader seu com o mesmo prelúdio dos outros. `<ShaderEditor>`
dá o editor com prévia ao vivo; `setCustomShader(codigo)` faz o mesmo por código.

### O que o prelúdio já entrega

```glsl
// som
uniform float uEnergy, uBass, uMid, uHigh;
// estado
uniform float uState, uPace, uSpin, uInward, uTurbulence, uCohesion;
uniform float uWaveIn, uWaveOut, uBands, uShatter;
uniform float uSpeaking, uListening, uAgent;
uniform vec3  uMood;                 // a cor do estado atual
// marca e tela
uniform vec3  uSignal, uAccent;
uniform vec2  uResolution;
uniform float uTime, uAlpha;

float hash(vec2 p);
float noise(vec2 p);
float fbm(vec2 p);     // 5 oitavas
```

Escreva só o `void main()` e termine em `gl_FragColor`. O ponto de partida está em
`CUSTOM_STARTER`:

```glsl
void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution) / min(uResolution.x, uResolution.y);
  float raio = 0.42 + uEnergy * 0.18 + fbm(uv * 2.0 + uTime * uPace * 0.3) * 0.06;
  float borda = smoothstep(raio, raio - 0.14, length(uv));
  vec3 cor = mix(uSignal, uMood, 0.65) + uHigh * 0.25;
  gl_FragColor = vec4(cor * borda, borda * uAlpha);
}
```

> **Respeite o `uAlpha` no alpha final.** É por ele que o visual aparece e some com transição em vez
> de estalar na tela.

> **O prelúdio traz `domain warping` e `smooth-min` prontos.** São as duas peças que produzem o
> aspecto líquido sem simulação de fluido — se você está tentando fazer algo parecer orgânico e o
> resultado está duro, é isso que está faltando, não mais oitavas de ruído.

### Erros de compilação

`ShaderVisual.ok` diz se o programa subiu, e `ShaderVisual.failure` traz o log do driver **com o
número da linha já descontado do prelúdio**.

> Sem esse desconto, o driver reclama da linha 207 de um arquivo concatenado que o usuário nunca
> viu, e a mensagem vira ruído. Com ele, aponta a linha 3 do que está na tela.

> **Não grave shader que não compila.** O `<ShaderEditor>` só persiste quando `ok` é verdadeiro:
> um shader quebrado salvo nas preferências derruba o visual em telas onde não há editor nem
> mensagem de erro, e o usuário não tem como voltar atrás.

---

## Quando **não** usar shader

`AmbientEdgeVisual` é canvas 2D de propósito. É uma faixa fina de luz numa moldura, e um contexto
WebGL inteiro para desenhar isso é desperdício — o custo do contexto não se paga.

> **Todo visual WebGL precisa do caminho de reserva.** `shadersAvailable()` sonda num canvas
> descartável (um canvas só aceita um tipo de contexto **para sempre**, então sondar no canvas real
> o queimaria para o 2D). Se o shader não sobe, o `<VoiceOrb>` cria um canvas novo e cai no
> `ParticleOrbRenderer`. Ligue `onMounted` durante a integração: `fallback: true` é a diferença
> entre "não reage" e "não compilou", que parecem iguais na tela.

---

## Movimento reduzido

Todos os renderers aceitam `reducedMotion` e o `<VoiceOrb>` lê `prefers-reduced-motion` sozinho.
Não desligue a animação inteira — o visual é o que diz o estado. O que o modo reduzido faz é tirar
a oscilação contínua e manter só a resposta ao áudio.

---

## CSS de partida

O kit **não traz CSS**: emite nomes de classe e deixa a aparência com você. Isto é um ponto de
partida funcional, não um tema.

```css
/* ── palco ─────────────────────────────────────────────── */
.voice-stage { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.voice-stage.focada   { padding: 8vh 20px 24px; }
.voice-stage.compacta { position: fixed; right: 20px; bottom: 20px; padding: 0; }

.voice-orb { border: 0; background: none; padding: 0; cursor: pointer; line-height: 0; }
.voice-label { font-size: 13px; color: #8a9497; }
.voice-transcript {
  margin: 0; max-width: 34ch; text-align: center; font-weight: 500; line-height: 1.5;
  /* O rascunho muda o tempo todo; sem altura estável a tela pula a cada palavra. */
  min-height: 3em;
}

.voice-controls { display: flex; gap: 12px; }
.voice-control {
  display: grid; place-items: center; width: 40px; height: 40px; border-radius: 50%;
  border: 1px solid #2a3336; background: transparent; color: inherit; cursor: pointer;
}
.voice-control.mudo     { color: #e4b65e; border-color: #e4b65e; }
.voice-control.encerrar:hover { color: #e0576a; border-color: #e0576a; }

/* ── seletor de visual ─────────────────────────────────── */
.visual-picker { display: grid; grid-template-columns: repeat(auto-fit, minmax(168px, 1fr)); gap: 12px; }
.visual-option {
  display: flex; flex-direction: column; padding: 0; overflow: hidden; text-align: left;
  border: 1px solid #2a3336; border-radius: 12px; background: #151b1e; color: inherit;
}
.visual-option.chosen { border-color: #58d8cd; box-shadow: 0 0 0 1px #58d8cd; }
.visual-stage { position: relative; display: block; aspect-ratio: 16/10;
  background: radial-gradient(circle at 50% 55%, #0e1214, #07090a 78%); }
.visual-stage canvas { display: block; width: 100%; height: 100%; }
.visual-stage em { position: absolute; inset: 0; display: grid; place-items: center;
  font-style: normal; font-size: 11px; color: #8a9497; }
/* `[hidden]` é regra do navegador e perde para qualquer classe: sem isto o aviso de falha
   fica visível por cima de um shader que está rodando bem. */
.visual-stage em[hidden] { display: none; }
.visual-option > span { display: block; padding: 10px 12px; border-top: 1px solid #2a3336; }
.visual-option small { display: block; font-size: 10.5px; color: #8a9497;
  font-family: ui-monospace, monospace; margin-top: 3px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── editor de shader ──────────────────────────────────── */
.shader-editor { display: grid; gap: 12px; }
.shader-preview { aspect-ratio: 16/7; border: 1px solid #2a3336; border-radius: 12px;
  overflow: hidden; background: radial-gradient(circle at 50% 55%, #0e1214, #07090a 78%); }
.shader-preview canvas { display: block; width: 100%; height: 100%; }
.shader-code textarea { width: 100%; min-height: 220px; resize: vertical; padding: 12px 14px;
  border: 1px solid #2a3336; border-radius: 12px; background: #151b1e; color: inherit;
  font-family: ui-monospace, monospace; font-size: 12px; line-height: 1.55; tab-size: 2; }
.shader-status { display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px; min-height: 32px; font-size: 11.5px; }
.shader-status pre { margin: 0; max-height: 76px; overflow: auto; white-space: pre-wrap;
  font-family: ui-monospace, monospace; font-size: 11px; }
.probe-ok  { color: #58d8cd; }
.probe-off { color: #e0576a; }
```

---

## O que **não** mexer

Uma lista curta do que parece livre e não é:

1. **`listening` e `speaking` em temperaturas opostas.** Ver acima.
2. **O sinal de `inward`** nesses dois estados: positivo absorve, negativo emite.
3. **O canvas criado fora do React.** Parece over-engineering até o dia em que trocar de visual
   derruba a tela inteira, porque o canvas já estava preso ao contexto WebGL anterior e
   `getContext("2d")` devolveu `null`.
4. **O parcial nunca abrir turno.** É rascunho de um motor pior que o do lote. Se ele virar comando,
   você troca 2 segundos de latência por ações erradas.
5. **A supressão de eco durante a fala.** Sem ela, ela transcreve a própria resposta e conversa
   sozinha — literalmente.

---

*Documentado por: Claude Code (Opus 5) — 2026-09-10.*
