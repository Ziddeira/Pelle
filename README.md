# Pelle — Tour virtual (vídeo em JavaScript)

Vídeo 16:9 (1920×1080, 30 fps, ~33 s) gerado 100% em JavaScript/Canvas. É um
plano-sequência em primeira pessoa, estilo drone FPV, que destaca as **placas de
revestimento efeito mármore** da Pelle.

**Vídeo pronto:** [`video/pelle-tour.mp4`](video/pelle-tour.mp4)

## Roteiro

| Tempo | Cena | Câmera |
|---|---|---|
| 0,0 – 3,1 s | Fachada com portal em mármore Nero e logo Pelle | Avanço **rápido**; a porta de duas folhas se abre e o drone atravessa |
| 3,1 – 8,4 s | Recepção | Desacelera e se aproxima do painel de mármore (destaque "Mármore Nero") |
| 8,4 – 9,2 s | Transição | Giro lateral passando por trás de uma parede (sem corte) |
| 9,2 – 15,9 s | Sala de reuniões | **Close lento**: parede de mármore e depois o tampo da mesa |
| 15,9 – 16,8 s | Transição | Voo rápido atravessando um batente |
| 16,8 – 20,9 s | Banheiro | Passagem rápida até o frontão em ônix |
| 20,9 – 21,6 s | Transição | Giro **rápido** para o quarto |
| 21,6 – 33,1 s | Quarto | Painel de ônix retroiluminado e encerramento com a marca |

Não há cortes: as mudanças de ambiente são feitas com o próprio movimento da
câmera (giro atrás de uma parede, travessia de porta), motion blur real e leve
tremor de drone.

Os destaques de revestimento têm foco (o entorno escurece), contorno dourado,
brilho de pedra polida varrendo a placa e uma etiqueta com o nome do material.

## Como assistir

Abra o `index.html` no navegador. Para usar o botão **Exportar vídeo**, sirva
a pasta por um servidor local (o navegador bloqueia a leitura do canvas em
`file://`):

```bash
npx serve .
# abra http://localhost:3000
```

O botão **Exportar vídeo** renderiza quadro a quadro e baixa um MP4 (H.264) no
Chrome/Edge, ou WebM (VP9) nos navegadores sem H.264.

## Renderizar o MP4 pela linha de comando

```bash
npm install
npm run render            # gera video/pelle-tour.mp4
npm run stills -- 3,12,25 # PNGs de quadros específicos em video/stills/
```

## Como editar

Tudo fica em `src/tour.js`:

- `MATERIALS`: textos das etiquetas (nome do revestimento e descrição).
- `SHOTS`: para cada ambiente, a foto, os keyframes da câmera `[tempo, x, y, zoom]`
  e os destaques (`poly` = contorno da placa em pixels da foto, `label` = posição
  da etiqueta na tela).
- `TIMELINE`: ordem das cenas e transições (`entrance`, `shot`, `whip`, `portal`).
- `CHAPTERS` e `END_T0`: títulos dos ambientes e início do encerramento.

Para trocar uma foto, substitua o arquivo em `assets/` e ajuste o `poly` do
destaque correspondente.

## Estrutura

```
index.html          player (16:9) com reprodução, navegação e exportação
src/tour.js         motor do vídeo: câmera, cenas, transições e destaques
src/marble.js       textura procedural de mármore Nero (fachada)
src/player.js       controles do player e exportação (WebCodecs)
src/vendor/         mp4-muxer e webm-muxer (MIT)
tools/render.mjs    renderização em MP4 via Playwright + ffmpeg
assets/             fotos dos ambientes e fontes (Jost, Cormorant Garamond, OFL)
```
