# Pelle — Tour cinematográfico (vídeo em JavaScript)

Vídeo 16:9 (1920×1080, 24 fps, 31,5 s) gerado 100% em JavaScript/Canvas: um
plano-sequência em primeira pessoa, estilo drone FPV com gimbal, **sem textos e
sem cortes**, que percorre o imóvel valorizando as placas de revestimento efeito
mármore.

**Vídeo pronto:** [`video/pelle-tour.mp4`](video/pelle-tour.mp4)

## Roteiro

| Tempo | Movimento |
|---|---|
| 0 – 3,2 s | Fachada em mármore escuro; as portas de vidro automáticas se abrem e a câmera entra rápido |
| 3,2 – 8,2 s | Recepção: deslize suave até o painel de mármore |
| 8,2 – 9,5 s | Giro à direita atravessando a divisória de vidro |
| 9,5 – 16 s | Sala de reuniões: aproximação lenta da parede e da mesa de mármore |
| 16 – 17,3 s | Giro rápido à esquerda, passando pela porta do banheiro |
| 17,3 – 20,9 s | Banheiro: frontão em ônix |
| 20,9 – 22,1 s | Giro rápido à direita, passando pela porta do quarto |
| 22,1 – 31,5 s | Quarto: aproximação do painel de ônix retroiluminado, recuo lento e fade out |

### Como o "sem cortes" funciona

- Cada foto é tratada como uma câmera real: os giros são rotações em
  perspectiva (homografia), não um simples deslizar da imagem.
- As trocas de ambiente acontecem atravessando portas em 3D (parede, batente
  com profundidade e o próximo ambiente visto pelo vão), com a câmera
  inclinando nas curvas como um drone.
- Motion blur real (obturador de 180°), bloom nas luzes, tom quente de cinema,
  vinheta e grão de filme.

## Como assistir

Abra o `index.html` no navegador. Para usar o botão **Exportar vídeo**, sirva a
pasta por um servidor local (o navegador bloqueia a leitura do canvas em
`file://`):

```bash
npx serve .
```

O botão gera MP4 (H.264) no Chrome/Edge, ou WebM (VP9) nos navegadores sem H.264.

## Renderizar o MP4 pela linha de comando

```bash
npm install
npm run render            # gera video/pelle-tour.mp4
npm run stills -- 3,12,25 # PNGs de quadros específicos em video/stills/
```

## Como editar

Tudo fica em `src/tour.js`:

- `SHOTS`: foto de cada ambiente e keyframes da câmera `[tempo, x, y, zoom]`
  (x/y = ponto da foto para onde a câmera olha).
- `TIMELINE`: ordem das cenas e passagens (`entrance`, `shot`, `door`), com o
  lado do giro (`dir`) e o estilo da porta (`glass`, `black`, `wood`).
- `DOOR`, `WALL`, `FAC`: geometria das passagens e da fachada (em milímetros).

## Estrutura

```
index.html          player 16:9 com reprodução, navegação e exportação
src/tour.js         motor do vídeo: câmera, projeção, passagens, pós-produção
src/marble.js       textura procedural de mármore (fachada)
src/player.js       controles do player e exportação (WebCodecs)
src/vendor/         mp4-muxer e webm-muxer (MIT)
tools/render.mjs    renderização em MP4 via Playwright + ffmpeg
assets/             fotos dos ambientes
```
