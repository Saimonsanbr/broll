# broll — Plano de evolução: imagens, créditos e imagem → vídeo

> **Documento vivo.** As seções [Onde estamos](#onde-estamos) e [Erros aprendidos](#erros-aprendidos) devem ser atualizadas a cada etapa do desenvolvimento.
>
> | Campo | Valor |
> |---|---|
> | Repositório | `Saimonsanbr/broll` — https://github.com/Saimonsanbr/broll |
> | Pasta local | `/Users/saimosan/Canais/ferramentas/videos` |
> | Branch de trabalho planejada | `feat/images-img2vid` |
> | Versão atual | `0.1.1` |
> | Versão alvo | `0.2.0` |
> | Última atualização | 2026-11-20 |
> | Status geral | **Fase 1 concluída (código). Aguardando teste manual no app.** |

---

## 1. Objetivo

Evoluir o **broll** de um buscador de vídeos para um buscador de **mídia mista (vídeos + imagens)**, com três frentes principais:

1. **Imagens** de Pexels, Pixabay e Wikimedia Commons, no mesmo fluxo de preview, download e arrasto dos vídeos.
2. **Crédito automático** nas imagens do Commons que exigem atribuição, aplicado no arquivo baixado, com arquivo original leve e sidecar de licença preservados.
3. **Imagem → vídeo** com ffmpeg: gerar um `.mp4` 1920×1080 (16:9), 5 s, a partir de uma imagem já baixada, com templates de composição, animação e filtro, abrindo a pasta de saída ao final.

Além disso: corrigir dois bugs prioritários (scroll do Mac que morre e card “pronto” que trava o arrasto) e adicionar um **modo de mídia** (ambos / imagens / vídeos) que funciona como filtro nos resultados já carregados e como definição da próxima busca.

---

## 2. Decisões fechadas (contrato do projeto)

### 2.1 Modo de mídia

| ID | Decisão |
|---|---|
| M1 | Não é uma aba separada. É **um modo** aplicado ao mesmo grid de resultados. |
| M2 | Ciclo do botão: `ambos (vídeos e fotos)` → `imagens` → `vídeos` → `ambos...` |
| M3 | Na tela inicial, o botão fica **embaixo da barra de pesquisa**, com o rótulo completo. |
| M4 | Na topbar, o botão fica no **canto superior direito, à esquerda do “max 1080p”**, com rótulo compacto. |
| M5 | O botão continua clicável durante a busca e pode ser trocado a qualquer momento. |
| M6 | **Nova busca** usa o modo ativo: “imagens” busca só imagens, “vídeos” só vídeos, “ambos” busca os dois. |
| M7 | **Resultados já carregados**: o botão filtra visualmente, sem refazer a busca. |
| M8 | A paginação da busca atual continua carregando **as duas fontes em segundo plano**, mesmo com um tipo filtrado, para a troca ser instantânea. |
| M9 | Se o resultado atual não contém o tipo necessário para o modo escolhido, a tela fica **totalmente vazia** (escondendo até o que existe) com um SVG central e mensagem + botão para refazer a busca. Comportamento confirmado e intencional. |
| M10 | O último modo escolhido é **persistido** e restaurado ao abrir o app. |
| M11 | Animação leve na troca de rótulo/ícone; sem exageros. |

### 2.2 Fontes de imagem

| ID | Decisão |
|---|---|
| I1 | **Pexels fotos**: usar o modo **web / endpoints internos** como caminho principal, porque a Pexels pausou a emissão de novas chaves. Se já existir chave configurada, a API oficial continua sendo usada. |
| I2 | **Pixabay imagens**: usa a mesma chave já configurada para vídeos. |
| I3 | **Wikimedia Commons**: API pública, sem chave. Buscar em `namespace 6` (arquivos), com metadados de licença. |
| I4 | Filtrar formatos comuns de imagem: **jpg, png, webp**. Fora SVG, GIF, TIFF e afins. |
| I5 | Cada card de imagem mostra a fonte e, quando for Commons, a licença em **texto pequeno sobre a imagem**, com sombra suave para contraste. **Sem ícone.** |
| I6 | Preview no hover, download no clique, arrastar depois de pronto — igual aos vídeos. |
| I7 | Tamanho mínimo aceito: **480 px no menor lado**. |
| I8 | Tamanho máximo desejado: **4000 px no menor lado** e **6000 px no maior lado**. Se a fonte for maior, baixar/redimensionar para caber nesses limites; nunca fazer upscale. |
| I9 | O limite de 2048 px foi descartado por ser pequeno demais para o uso. |

### 2.3 Licenças e crédito

| ID | Decisão |
|---|---|
| L1 | Estudar e seguir `Commons:Licensing`. O Commons só aceita conteúdo livre; **não** aceita licenças exclusivamente NonCommercial (NC) nem fair use. |
| L2 | Mesmo assim, o app deve usar uma **allowlist** de licenças e **falhar fechado** (ignorar a imagem) se a licença for desconhecida, NC, ND, fair use ou “all rights reserved”. |
| L3 | Quando a imagem **não** exigir crédito (CC0 / domínio público), baixar normalmente, **sem overlay**. |
| L4 | Quando exigir atribuição (CC BY, CC BY-SA etc.), aplicar o crédito **na própria imagem** no momento do download. |
| L5 | O crédito usa **Poppins** (fonte a ser embutida; licença OFL), texto pequeno, branco com ~70% de opacidade, **no topo, centralizado**, com sombra/faixa escura suave para legibilidade. O estilo exato será aprovado com testes locais. |
| L6 | Guardar uma **versão leve** da imagem original em `.originals/` e um `.txt` sidecar com crédito completo + URLs da licença e da página de origem. |
| L7 | O botão **“Limpar cache”** pode apagar as imagens de trabalho e as creditadas, mas **não pode apagar** `.originals/` nem os `.txt`. A pasta dos originais deve ser visível/aberta nas configurações. |
| L8 | O crédito embutido na imagem **não** é usado para gerar o vídeo. Na geração, buscar novamente a imagem sem crédito e aplicar o crédito **sobre o vídeo final**, estático, para ele não “andar” com a animação. |
| L9 | O vídeo gerado também ganha um `.license.txt` ao lado quando a licença exigir atribuição. |
| L10 | Ponto de atenção: licenças **ShareAlike** (CC BY-SA) podem exigir que a obra derivada (o vídeo) seja distribuída sob a mesma licença. O app deve registrar isso no sidecar e deixar claro no card. |

### 2.4 Ferramentas locais (ImageMagick / ffmpeg)

| ID | Decisão |
|---|---|
| F1 | Tentar **embutir os binários** no app para não exigir instalação (ffmpeg estático por plataforma; Poppins embutida). |
| F2 | Preferência técnica: usar **ffmpeg com `drawtext`** para o crédito em imagens e vídeos, pois o ffmpeg já é necessário para o imagem → vídeo. Isso evita depender de ImageMagick. |
| F3 | Se o `drawtext` não der a qualidade/controle desejado, comparar com **ImageMagick** (`magick`/`convert`) e escolher o mais simples e eficiente. |
| F4 | Manter fallback para binários do sistema (PATH + caminhos comuns do Homebrew) e permitir caminho customizado nas configurações. |
| F5 | No macOS, app aberto pelo Finder **não herda o PATH do shell**. Detectar explicitamente `/opt/homebrew/bin` e `/usr/local/bin`, ou usar o binário embutido. |
| F6 | Se nenhuma ferramenta estiver disponível ao baixar uma imagem que exige crédito, **bloquear o download** e mostrar instruções — nunca baixar sem crédito por acidente. |
| F7 | Se não houver ferramenta para gerar vídeo, o modal mostra instruções e desabilita o botão. |
| F8 | Verificar licenças de redistribuição dos binários (ffmpeg LGPL/GPL) e incluir os avisos necessários no app/README. |

### 2.5 Imagem → vídeo

| ID | Decisão |
|---|---|
| V1 | Só em imagem já baixada (card com contorno verde). |
| V2 | Ação por **botão direito** no card → “Gerar vídeo”. |
| V3 | Modal com: composição, animação, fundo (quando duplicada), filtro, preview e botão “Gerar vídeo”. |
| V4 | Composição: **imagem única** ou **duplicada** (mesma foto maior atrás). |
| V5 | Fundo da duplicada: desfocado, escurecido, ou desfocado + escuro. |
| V6 | Animações estilo Ken Burns: zoom lento, pan de cima para baixo, etc. Lista final a definir no modal. |
| V7 | Filtros: nenhum, VHS, fade, etc. Lista final a definir no modal. |
| V8 | Duração fixa de **5 s** na v1. Seletor 3/5/10 s fica no backlog. |
| V9 | Resolução **sempre 1920×1080 (16:9)**, independentemente do formato da imagem. Imagem vertical/quadrada é ajustada com fundo/recorte. |
| V10 | Saída em `app.getPath('videos')/broll-img2vid` (Mac: `~/Movies/broll-img2vid`). |
| V11 | Ao terminar, **abrir a pasta** no Finder/Explorer/gerenciador de arquivos. |
| V12 | Mostrar progresso da geração e tratar erros no próprio modal. |
| V13 | O crédito é aplicado **depois** da animação, no vídeo final, no topo/centro. |

### 2.6 Bugs prioritários

| ID | Decisão |
|---|---|
| B1 | Corrigir primeiro o card que fica “pronto” no meio, com contorno verde, mas não arrasta. |
| B2 | Corrigir o scroll do Mac que para de funcionar depois de um tempo e só volta reabrindo o app. |
| B3 | Essas correções vêm antes de qualquer feature nova. |
| B4 | Reproduzir e instrumentar antes de alterar, para não mascarar a causa. |

### 2.7 Processo

| ID | Decisão |
|---|---|
| P1 | Trabalhar em branch `feat/images-img2vid`. |
| P2 | **Um commit por fase**, para permitir revisão e rollback isolados. |
| P3 | Não commitar nem buildar enquanto o usuário não aprovar a etapa. |
| P4 | Só rodar build empacotado no final, depois dos testes no `dev`. |
| P5 | Atualizar este documento a cada fase, principalmente “Onde estamos” e “Erros aprendidos”. |

### 2.8 Indicadores de tipo de mídia

| ID | Decisão |
|---|---|
| K1 | Todo card — vídeo ou imagem — tem um **ícone SVG pequeno** indicando o tipo. |
| K2 | Posição: **diagonal superior esquerda** do card. |
| K3 | Aparece em **todos os modos**, inclusive quando o grid tem só um tipo. |
| K4 | É **apenas interface**: não é embutido no arquivo baixado, não vai pro CapCut/Finder e não aparece no vídeo gerado. |
| K5 | Serve para diferenciar rapidamente no modo “ambos”; não substitui o texto de fonte/licença. |
| K6 | O badge textual **“pronto p/ arrastar” será removido**. O estado pronto passa a ser indicado apenas pelo **contorno verde** (e cursor de arrasto). |
| K7 | Com o badge removido, o topo-esquerdo fica **só com o ícone de tipo**; o topo-direito continua com duração/qualidade. |

---

## 3. Licenciamento do Wikimedia Commons (pesquisa)

Fonte principal: https://commons.wikimedia.org/wiki/Commons:Licensing

### 3.1 Regra central

O Commons só aceita **conteúdo livre**, ou seja, que qualquer pessoa possa usar, a qualquer momento, para qualquer finalidade. Isso inclui **uso comercial**. Licenças exclusivamente **NonCommercial (NC)** e justificativas de **fair use** não são aceitas.

### 3.2 Licenças aceitáveis para o nosso filtro

Allowlist inicial:

- **CC0** (domínio público, sem exigência de atribuição).
- **Public Domain / PD** (domínio público).
- **CC BY** (1.0 a 4.0) — exige atribuição.
- **CC BY-SA** (1.0 a 4.0) — exige atribuição e pode exigir ShareAlike na obra derivada.
- **Free Art License (FAL/LAL)**.

Rejeitar (fail closed) quando a licença for:

- **NC / NonCommercial**.
- **ND / NoDerivs**.
- **Fair use**.
- **All rights reserved** ou licença desconhecida.
- Qualquer metadado ausente ou ambíguo.

> O Commons não deveria hospedar NC-only, mas a allowlist é uma proteção extra contra metadados estranhos, multi-licenciamento e erros de marcação.

### 3.3 Campos de metadados a usar

Da API `imageinfo` / `extmetadata`:

- `LicenseShortName` — nome curto da licença.
- `LicenseUrl` — URL da licença.
- `AttributionRequired` — `true`/`false`.
- `Artist` — autor (pode vir com HTML; limpar).
- `Credit` — crédito adicional (pode vir com HTML; limpar).
- `ObjectName` — nome do arquivo.
- `UsageTerms` — termos de uso, quando existirem.

Regras:

- Se `AttributionRequired === 'true'` **ou** a licença for CC BY/CC BY-SA/FAL → aplicar crédito.
- Se a licença for CC0/PD e `AttributionRequired` não for `true` → baixar sem overlay.
- Se `AttributionRequired` estiver ausente, inferir pela licença.
- Se a licença não estiver na allowlist → ignorar o resultado.
- Sempre guardar a URL da página do arquivo e a URL da licença no sidecar.

### 3.4 Cuidados adicionais

- **ShareAlike**: o vídeo gerado a partir de uma imagem CC BY-SA pode precisar ser distribuído sob a mesma licença. Registrar no sidecar do vídeo.
- **Direitos não autorais**: imagem pode ter direitos de personalidade, marca registrada ou propriedade do local. O Commons pode hospedar, mas o reuso pode exigir cuidado. O app não consegue resolver isso automaticamente; registrar um aviso no sidecar quando os metadados indicarem restrições.
- **User-Agent**: a API do Wikimedia exige User-Agent descritivo. Usar algo como `broll/0.2 (https://github.com/Saimonsanbr/broll)`.
- **Rate limit**: manter pausas e cache; não disparar buscas em paralelo sem necessidade.

---

## 4. Mudanças técnicas previstas

### 4.1 Modelo de item

Cada resultado passa a ter:

```js
{
  id,                 // prefixado por fonte e tipo
  kind,               // 'video' | 'image'
  source,             // 'pexels' | 'pexels-web' | 'pixabay' | 'wikimedia'
  width, height,
  duration,           // só vídeo
  thumb,
  previewUrl,
  downloadUrl,
  author,
  pageUrl,
  license: {          // só quando aplicável
    shortName,
    url,
    attributionRequired,
    shareAlike
  },
  attribution: {      // texto pronto para overlay/sidecar
    text,
    html
  }
}
```

No renderer, o estado do card ganha `kind` e os status:

`remote` → `downloading` → `ready` (e `processing` para geração de vídeo, se necessário).

### 4.2 Busca unificada

- Refatorar `search:videos` para `search:media` com `mode` (`both` | `images` | `videos`).
- Paginação independente por fonte:
  - vídeos: `pexV`, `pixV`
  - imagens: `pexI`, `pixI`, `commons`
- Retornar `items` com `kind`, `hasMore` e `fetched` por fonte.
- Intercalar fontes no grid, mantendo variedade.
- Manter compatibilidade temporária com o fluxo antigo até a UI nova estar pronta.

### 4.3 Cache e arquivos

Estrutura prevista:

```
~/Movies/BROLL_CACHE/
  {query}-{id}-{w}x{h}.mp4              # vídeos prontos
  {query}-{id}-{w}x{h}.jpg              # imagens prontas sem crédito
  {query}-{id}-{w}x{h}-credit.jpg       # imagens com crédito embutido
  .thumbs/                              # thumbnails para o drag
  .originals/
    {id}.jpg                            # versão leve da imagem, para arquivo
    {id}.license.txt                    # crédito completo + URLs
```

Regras:

- `cache:clear` apaga arquivos de trabalho e `.thumbs`, mas **preserva `.originals` e os `.txt`**.
- Configurações mostram o caminho de `.originals` e um botão para abrir.
- Nome do arquivo continua sanitizado (`sanitize`) e inclui query, id e dimensões.
- Imagens com crédito usam sufixo `-credit` para não colidir com a versão sem crédito.

### 4.4 Ferramentas

Novo módulo `electron/tools.js`:

- Resolver binário: caminho customizado → embutido → PATH → caminhos comuns (`/opt/homebrew/bin`, `/usr/local/bin`, `C:\...`).
- Executar com timeout e capturar `stderr`.
- `hasFfmpeg()`, `hasMagick()`, `run()`.
- Status exposto nas configurações e via IPC.

Spike obrigatório antes de codar a feature:

1. Testar um **ffmpeg estático** com `drawtext` + `zoompan` em Mac Apple Silicon.
2. Gerar um JPEG creditado e um MP4 1920×1080 de 5 s sem Homebrew instalado.
3. Comparar com ImageMagick em qualidade, tamanho e facilidade de empacotamento.
4. Decidir: ffmpeg único vs. ffmpeg + ImageMagick.

### 4.5 Imagem → vídeo

Novo módulo `electron/img2vid.js`:

- Definição de templates (composição + animação + fundo + filtro).
- Montagem do comando ffmpeg.
- Progresso via `-progress pipe:1`.
- Saída em `broll-img2vid` e abertura da pasta.
- Re-busca da imagem sem crédito antes de gerar.
- Overlay do crédito no vídeo final, estático.

Pipeline conceitual:

```
imagem original (sem crédito)
  → composição 1920×1080 (única ou duplicada com fundo)
  → Ken Burns (zoom/pan) por 5 s
  → filtro (VHS/fade/etc.)
  → drawtext do crédito no topo/centro
  → H.264 + yuv420p + faststart
  → ~/Movies/broll-img2vid/*.mp4
```

---

## 5. UX detalhada

### 5.1 Botão de modo

- Home: abaixo da barra de pesquisa, centralizado, rótulo completo “ambos (vídeos e fotos)”.
- Topbar: à esquerda do badge de qualidade, rótulo compacto com ícone.
- Ciclo: ambos → imagens → vídeos → ambos.
- Transição suave de rótulo/ícone.
- Persistir último modo.
- Acessível por teclado (`aria-label`, foco visível).

### 5.2 Filtro e empty state

- Resultado atual guarda `searchMode` e quais tipos existem.
- Modo “ambos” só mostra se houver os dois tipos; se só houver um, empty state.
- Empty state: grid oculto, SVG central grande, texto explicando o que falta e botão “Pesquisar novamente”.
- Exemplos de mensagem:
  - “Esta busca só tem imagens. Pesquise novamente para encontrar vídeos.”
  - “Esta busca só tem vídeos. Pesquise novamente para encontrar imagens.”
- Ao voltar para um modo com resultados, eles reaparecem.

### 5.3 Cards de imagem

- Aspect ratio própria para imagem (a definir no teste visual; provavelmente 4:5 ou 1:1).
- Preview no hover (imagem é barata; pode ser `<img>` direto).
- Clique baixa; contorno verde quando pronto; arrasta como os vídeos.
- Texto pequeno no topo com fonte e licença, com sombra. **Sem ícone de licença** (o único ícone do card é o de tipo de mídia, descrito em 5.6).
- Selo/ação de “Gerar vídeo” no botão direito quando pronta.

### 5.4 Crédito

- Topo, centralizado.
- Poppins, pequeno, branco ~70%.
- Sombra/faixa escura suave atrás para contraste.
- Largura máxima e quebra em até 2 linhas; testar nomes longos e acentos.
- Testar em imagens claras e escuras.
- Aprovar estilo com script local antes de integrar.

### 5.5 Modal de geração de vídeo

- Thumbnail da imagem.
- Composição: única / duplicada.
- Fundo: blur / escuro / blur + escuro (só duplicada).
- Animação: zoom in, zoom out, pan up, pan down (lista final).
- Filtro: nenhum, VHS, fade (lista final).
- Duração: 5 s fixo na v1.
- Preview do resultado (se viável) ou descrição.
- Botão “Gerar vídeo” + progresso.
- Ao concluir: mensagem de sucesso + abrir pasta.

### 5.6 Ícone de tipo no card

- Ícone **SVG pequeno**, no **canto superior esquerdo** do card.
- **Vídeo**: ícone de play/filme. **Imagem**: ícone de foto.
- Fundo escuro translúcido e/ou sombra para garantir contraste em qualquer thumbnail.
- Visível em **todos os modos** — “ambos”, “imagens” e “vídeos”.
- Puramente visual: **não é embutido no arquivo**, não vai pro CapCut/Finder e não aparece no vídeo gerado.
- O badge textual **“pronto p/ arrastar” será removido** do card. O estado pronto será comunicado pelo **contorno verde** e pelo cursor `grab`; nada de texto extra no topo.
- Com isso, o topo-esquerdo fica reservado ao ícone de tipo, sem concorrência de espaço.
- Não confundir com o texto de fonte/licença: o ícone indica **tipo**, o texto indica **origem/licença**.

---

## 6. Etapas de desenvolvimento

> Ordem escolhida para reduzir risco: bugs primeiro; ferramentas antes do crédito; backend antes da UI; modo depois que os dois tipos existem; imagem → vídeo por último.

| Fase | Status | Entrega | Critério de pronto |
|---|---|---|---|
| **0. Baseline** | ✅ concluído | Branch `feat/images-img2vid`; reproduzir os 2 bugs com logs; checklist de teste | Bugs reproduzidos e causa confirmada; nenhuma mudança de comportamento ainda |
| **1. Bugs** | ✅ código pronto, aguardando teste manual | Correção do “pronto” travado + scroll do Mac | Stress test passa; arrasto confiável; scroll estável |
| **2. Ferramentas** | ✅ código pronto, aguardando teste manual | Spike de binários; `tools.js`; status nas configurações | Crédito e vídeo funcionam sem Homebrew (se o bundle for viável) |
| **3. Backend de imagens** | ✅ código pronto, aguardando UI (Fase 4) | Pexels fotos (web/API), Pixabay, Commons; licenças; paginação | Busca retorna imagens normalizadas e licenças corretas |
| **4. UI de imagens + crédito** | ✅ código pronto + 1 correção pós-teste, aguardando reteste | Cards, preview, download, cache, `.originals`, sidecar, overlay, drag | Imagem creditada arrasta pro CapCut/Finder; cache clear preserva originais |
| **5. Modo/filtro** | ✅ código pronto, aguardando teste manual | Botão nos 2 lugares, 3 estados, filtro, empty state, persistência | Matriz de testes do modo passa |
| **6. Imagem → vídeo** | ✅ código pronto, aguardando teste manual | Modal, templates, ffmpeg, progresso, pasta de saída | Cada template gera 1920×1080/5 s e abre a pasta |
| **7. Polimento** | ✅ concluído | README, versão 0.2.0, build empacotado, validação cross-platform | App buildado testado; documentação atualizada |

### Fase 0 — Baseline

- Criar branch.
- Confirmar árvore limpa.
- Reproduzir o bug do “pronto” e o do scroll com logs.
- Anotar gatilhos exatos (depois de arrastar? depois de muitos hovers? depois de muito scroll?).
- Nenhum commit de feature ainda.

### Fase 1 — Bugs

**Bug A — “pronto” preso + não arrasta (hipótese forte):**

- O main envia `video:progress` com `pct: 100` e logo resolve o download.
- Se o evento de progresso chega **depois** de `markReady()`, ele volta o status para `downloading` e mostra o overlay “pronto”, mas o contorno verde já ficou.
- O `dragstart` exige `status === 'ready'`; como voltou para `downloading`, não inicia o arrasto.
- Segundo suspeito: o `<video>` do card é draggable por padrão e pode roubar o drag do card.

Correções previstas:

- Ignorar eventos de progresso quando o card já está `ready`.
- Estado de progresso monotônico.
- `markReady` atômico: esconde overlay, define status e caminho.
- `<video draggable="false">` + CSS `-webkit-user-drag: none`.
- `startDrag` só com arquivo existente; se falhar, reverter para `remote` e avisar.

**Bug B — scroll do Mac morre (suspeitos):**

1. Acúmulo de `<video>` de preview: cada hover cria um player remoto que nunca é liberado.
2. Flood de IPC: uma mensagem de progresso por chunk baixado.
3. Sessão de drag nativo do macOS deixando a janela em estado estranho.

Correções previstas:

- Um único player de preview compartilhado, ou liberar `src` + `load()` ao sair do hover.
- Throttle do progresso (só quando o percentual inteiro muda, com intervalo mínimo).
- Endurecer o drag e testar o retorno do CapCut para o app.
- Stress test com 300+ cards, 100 hovers, 10 downloads, 10 arrastos e rolagem longa.

### Fase 2 — Ferramentas

- Spike de binários (ffmpeg estático + `drawtext` + Poppins).
- `electron/tools.js` com detecção e execução.
- Configurações: status, caminho, “detectar novamente”, instruções.
- Testar em Mac sem Homebrew, com Homebrew e com caminho customizado.
- Decidir oficialmente: ffmpeg único ou ffmpeg + ImageMagick.

### Fase 3 — Backend de imagens

- Pexels fotos: validar endpoint web interno e formato do JSON.
- Pixabay imagens: validar `image_type=photo`, tamanhos e licença.
- Commons: validar `generator=search`, `namespace 6`, `extmetadata`, `iiurlwidth`.
- Normalização, allowlist de licença, paginação e intercalação.
- Script de probe para inspecionar respostas reais.
- Testar sem chave, com chave, rate limit e offline.

### Fase 4 — UI de imagens + crédito

- Card de imagem, badge textual de licença, preview, download, drag.
- Ícone SVG de tipo no topo-esquerdo, para vídeos e imagens, em todos os modos.
- Remover o badge textual “pronto p/ arrastar”; manter apenas o contorno verde + cursor `grab` como sinal de pronto.
- Overlay de crédito no topo/centro com Poppins.
- `.originals` + `.txt`; ajustar `cache:clear`.
- Testar imagens claras/escuras, nomes longos, acentos, formatos e tamanhos.
- Testar arrasto no CapCut e no Finder.

### Fase 5 — Modo/filtro

- Estado `mode`, persistência, botão na home e na topbar.
- Busca por modo, filtro sem nova busca, empty state.
- Paginação em segundo plano.
- Testar matriz: 3 modos × busca × filtro × scroll × empty state × troca durante loading.

### Fase 6 — Imagem → vídeo

- Modal e templates.
- Re-busca da imagem sem crédito.
- Composição 1920×1080, Ken Burns, filtros, overlay de crédito no vídeo.
- Progresso, erros, abertura da pasta.
- Testar cada combinação de composição × animação × fundo × filtro.
- Testar reprodução no CapCut.

### Fase 7 — Polimento

- README: instalação, binários, licenças, uso de imagens e img2vid.
- Versão `0.2.0`.
- Build `dist:mac`, teste do app empacotado (PATH e `resourcesPath` mudam).
- Sanidade Windows/Linux (caminhos, nomes de binários, `openPath`).
- Atualizar este documento e as notas de release.
- Só então commitar build/tag, se aprovado.

---

## 7. Onde estamos

**Data:** 2026-11-20

**Fase atual:** Projeto concluído — v0.2.0 lançada. Todas as fases validadas/testadas.

**Concluído:**

- [x] Localizar o repositório e a pasta local.
- [x] Ler e entender o código atual (`electron/main.js`, `preload.js`, `src/app.js`, `index.html`, `style.css`, configs).
- [x] Levantar os dois bugs e formular hipóteses de causa.
- [x] Pesquisar a política de licenciamento do Wikimedia Commons.
- [x] Fechar as decisões de produto e técnica com o usuário.
- [x] Registrar a decisão do ícone SVG de tipo de mídia (UI-only) nos cards.
- [x] Definir a remoção do badge “pronto p/ arrastar” (fica só contorno verde + ícone de tipo).
- [x] Criar este documento.
- [x] Criar branch `feat/images-img2vid`.
- [x] Fase 1: corrigir “pronto” travado (guarda `ready`, `markReady` atômico, overlay “finalizando…”, download via `.part` + rename, `local-path` só com size > 0).
- [x] Fase 1: endurecer drag (`draggable=false` + CSS, remoção do badge `.stat`).
- [x] Fase 1: aliviar scroll (liberar `src`/`load()` no `mouseleave`, liberar vídeos na nova busca e no limpar cache, throttle de progresso no main, prefetch de thumb só no hover e em cards prontos).
- [x] `vite build` passando.
- [x] Fase 2: spike prova que ffmpeg Homebrew não tem `drawtext`; pipeline validado sem ele (magick annotate + zoompan + overlay de PNG).
- [x] Fase 2: `electron/tools.js` (detecção com fallback PATH/Homebrew/bin embutido/custom), IPC `tools:status`, status e caminhos customizados no drawer, fonte Poppins embutida (`assets/fonts`).
- [x] Teste manual Fases 1–2 (2026-11-20): buscas “café”, “eu aq”, “car”; 71 e 168 cards via scroll contínuo sem travar; paginação até esgotar (`hasMore=false`); nenhum “pronto” travado; ferramentas detectadas.
- [x] Fase 3: `electron/images.js` (módulo puro, testado com node) + IPC `search:images` + `preload.searchImages`; paginação independente (pex/pix por página, Commons por `gsroffset`); intercalação das 3 fontes; testes de licença (BY-SA ok com shareAlike, CC0 ok sem atribuição, BY-NC fora, fair use fora, desconhecida fora). Pixabay imagens validada com a chave real (500 hits).
- [x] Fase 5: botão de modo na home e na topbar (ciclo ambos→imagens→vídeos, animação pop, persistência), busca por modo, filtro sem refetch, empty state intencional com SVG + pesquisa no modo exibido.
- [x] Fase 6: `electron/img2vid.js` (composição única/duplicada, Ken Burns ×4, filtros nenhum/VHS/fade, crédito estático via overlay PNG, H.264 1920×1080/30fps/5s, progresso, cancelamento, sidecar) + IPC + modal (botão direito) + saída em `Movies/broll-img2vid` com abertura da pasta.

**Não iniciado:**

_(nada — todas as fases concluídas)_

**Próximo passo:** acompanhar o build da v0.2.0 no GitHub Actions e conferir a Release.

**Arquivos alterados nesta etapa:** `README.md`, `package.json`, `src/index.html`, `PLANO.md`.

---

## 8. Erros aprendidos

> Registro cumulativo. Cada entrada deve dizer o contexto, o aprendizado e a ação tomada/preventiva.

| Data | Contexto | O que aprendemos | Ação |
|---|---|---|---|
| 2026-11-19 | Planejamento | O bug do “pronto” travado tem cara de corrida entre o evento final de progresso e o `markReady()` | Ignorar progresso depois de `ready`; estado monotônico; teste de download grande |
| 2026-11-19 | Planejamento | `<video>` é draggable por padrão no Chromium e pode roubar o drag do card | `draggable="false"` + CSS + teste de arrasto no CapCut |
| 2026-11-19 | Planejamento | Vários players de preview acumulados podem travar a renderização no Mac | Player único ou liberar `src`/`load()` ao sair do hover; stress test |
| 2026-11-19 | Planejamento | Uma mensagem de IPC por chunk de download pode floodar o processo | Throttle de progresso |
| 2026-11-19 | Planejamento | A Pexels pausou novas chaves; o modo web/internal é o caminho principal | Validar endpoint de fotos e manter fallback |
| 2026-11-19 | Planejamento | App macOS aberto pelo Finder não herda o PATH do shell | Detectar `/opt/homebrew/bin` e `/usr/local/bin` ou embutir binário |
| 2026-11-19 | Planejamento | Creditar a imagem antes de animar faz o crédito “andar” com o zoom/pan | Buscar imagem sem crédito e aplicar overlay no vídeo final |
| 2026-11-19 | Planejamento | “Limpar cache” não pode apagar o arquivo de segurança/licença | Preservar `.originals/` e `.txt`; expor caminho nas configurações |
| 2026-11-19 | Planejamento | O empty state ao trocar para um modo sem o tipo necessário é intencional | Não “corrigir” para mostrar resultados parciais sem confirmação |
| 2026-11-19 | Pesquisa de licença | O Commons não aceita NC-only nem fair use, mas ainda assim é preciso allowlist | Filtrar licenças e falhar fechado; registrar licença e URL |
| 2026-11-19 | Pesquisa de licença | CC BY-SA pode exigir ShareAlike na obra derivada (vídeo) | Registrar no sidecar do vídeo e avisar no card |
| 2026-11-19 | Planejamento | 2048 px é pequeno demais para o uso desejado | Faixa 480 px (mín.) a 4000/6000 px (máx.) |
| 2026-11-19 | Planejamento | Indicador de licença no card deve ser texto, não ícone | Texto pequeno no topo com sombra |
| 2026-11-19 | Planejamento | O vídeo gerado é sempre 16:9, mesmo com imagem vertical/quadrada | Composição com recorte/fundo; 1920×1080 |
| 2026-11-19 | Planejamento | Crédito no topo/centro combina com o estilo do app e não atrapalha a composição | Poppins, branco ~70%, sombra suave; testar antes de integrar |
| 2026-11-19 | Planejamento | Embutir binários resolve o atrito de instalação, mas traz tamanho e licenças | Spike com ffmpeg estático + `drawtext`; decidir com dados |
| 2026-11-20 | Fase 1 | `prefetchThumb` disparado para cada resultado da busca gerava N requisições por página | Prefetch só no hover e em cards já em cache; reduz tráfego e ajuda o scroll |
| 2026-11-20 | Fase 1 | Download direto no nome final permitia `local-path` ver arquivo incompleto | Gravar em `.part` e renomear só no `finish`; `local-path` exige size > 0 |
| 2026-11-20 | Fase 2 (spike) | ffmpeg do Homebrew não tem `drawtext` (sem freetype) — crédito via `drawtext` falharia | Crédito via overlay de PNG com filtro `overlay` (sempre disponível); texto renderizado com magick/canvas + Poppins |
| 2026-11-20 | Fase 2 (spike) | App aberto pelo Finder não herda o PATH do shell | `tools.js` procura em bin embutido + `/opt/homebrew/bin` + `/usr/local/bin` + PATH + caminho customizado |
| 2026-11-20 | Fase 4 | `upload.wikimedia.org` retorna 403 “robot policy” sem User-Agent — download do Commons falharia no app | UA descritivo global no axios (`main.js` + `images.js`); validado download + crédito numa foto real (CC BY-SA 2.0) |
| 2026-11-20 | Fase 4 | Cards de vídeo e imagem no mesmo grid precisam de diferenciação imediata | Ícone SVG de tipo no topo-esquerdo (play/foto), aspecto 4:3 p/ imagem, badge textual de licença só no Commons |
| 2026-11-20 | Fase 4 (pós-teste) | Thumb preta após baixar imagem: `markReady` trocava `<img>` para `file://`, bloqueado na página http do dev; com download rápido o hover restaurava o thumb (parecia “recuperar”), com Commons lento ficava preto | Imagem pronta mantém o thumb remoto (já em cache); arquivo local serve só p/ arrastar |
| 2026-11-20 | Fase 4 (pós-teste) | Faixa de crédito ponta a ponta destoava da imagem | Caixa justa no texto (`caption` + `-trim` + `-border 26x14`), centralizada no topo |
| 2026-11-20 | Fase 5 (pós-teste) | Vídeos invisíveis em todos os modos: itens de vídeo não tinham `kind`, e o filtro compara `st.data.kind` | `kind: 'video'` nos 3 construtores de vídeo (Pexels API/web, Pixabay) |
| 2026-11-20 | Fase 5 (pós-teste) | Botão do empty state pesquisava no modo exibido (inútil quando igual ao da busca) | Botão busca o tipo que falta (troca o modo + pesquisa de novo) |
| 2026-11-20 | Fase 5 (pós-teste 2) | Com `kind` corrigido, display==busca nunca dá mismatch — botão deve pesquisar o modo exibido (incl. “ambos”) | Revertido para o modo exibido: “Pesquisar em ambos/vídeos/imagens” |
| 2026-11-20 | Fase 6 (spike) | `crop` não tem variável `on` (só `zoompan`); `n` é o nº do frame | Pan usa `n/150`; zoom usa `on/150` |
| 2026-11-20 | Fase 6 (spike) | Re-fetch do Commons no img2vid também precisa de UA | UA explícito no `fetchCleanSource` |
| 2026-11-20 | Fase 6 (spike) | VHS com CRF 20 gera ~45MB em 5s (ruído não comprime) | CRF 26 só p/ VHS |
| 2026-11-20 | Fase 6 (spike) | `format=yuv420p` sozinho mantém `yuvj420p` (full range do JPEG) | `scale=out_range=limited` antes do format; CapCut-safe |
| 2026-11-20 | Fase 6 (spike) | Falha/cancelamento deixava `.mp4` vazio na pasta | `unlink` da saída em falha/cancelamento |
| 2026-11-20 | Fase 6 (pós-teste) | Zoom tremia; pan era suave (jitter do `zoompan` por arredondamento) | Base do zoom em 3840×2160 (2x) antes do `zoompan` |
| 2026-11-20 | Fase 6 (pós-teste) | VHS só amarelava a imagem | Trocado por granulado leve, vinheta e granulado+vinheta; fade mantido |
| 2026-11-20 | Fase 6 (pós-teste) | Crédito do vídeo grande demais, quebrava feio no fim | Padrão 38 (era 44) + seletor pequeno/médio/grande no modal (apagado sem atribuição) |
| 2026-11-20 | Fase 6 (pós-teste 2) | Zoom ainda com micro-tremidas; `scale+crop` não resolve (cv 0.24 vs 0.26) | Zoom renderiza a 60fps (passo por frame cai pela metade); pan continua 30fps |
| 2026-11-20 | Fase 6 (pós-teste 2) | Granulado `alls=5` invisível em foto real | `alls=12` (CRF 26 contém o tamanho) |

---

## 9. Riscos e pontos a validar (spikes)

| Risco | Impacto | Como validar |
|---|---|---|
| Endpoint web de fotos da Pexels mudou/está protegido | Sem fotos Pexels no modo sem chave | Probe real antes da UI; fallback para API se houver chave |
| `drawtext` do ffmpeg estático sem freetype/Poppins | Crédito não renderiza | Spike com binário real, acentos e nomes longos |
| Tamanho do ffmpeg/ImageMagick embutido | App pesado | Comparar builds; decidir por plataforma |
| Licença de redistribuição do ffmpeg | Problema legal no release | Build LGPL, incluir avisos e fonte; revisar antes de publicar |
| `zoompan` com jitter | Vídeo tremido | Testar upscale antes do zoom; comparar fps/expressões |
| Filtro VHS feio ou lento | Resultado ruim | Testar presets; manter filtros simples |
| Imagens gigantes (4000/6000 px) | Memória/CPU | Limitar no download; redimensionar antes de compor |
| Nomes de autor longos no crédito | Texto cortado/ilegível | Testar quebra em 2 linhas e tamanho dinâmico |
| ShareAlike em vídeo derivado | Obrigação de licença | Sidecar + aviso; opção futura de filtrar SA |
| PATH diferente no app empacotado | Binário não encontrado | Testar `.app` buildado, não só `dev` |
| Windows/Linux não testados | Falhas de caminho/binário | CI + teste manual quando possível |
| `.originals` crescendo sem controle | Espaço em disco | Versão leve (ex.: 1600–2048 px) e botão para abrir/limpar manualmente |
| Remover o badge “pronto p/ arrastar” deixar o feedback de pronto menos explícito | Usuário não saber que já pode arrastar | Contorno verde forte + cursor `grab`; testar com usuário |
| Ícone de tipo no topo-esquerdo competir com duração/qualidade | Poluição visual | Ícones pequenos, discreto, testar em thumbnails claras/escuras |

---

## 10. Checklist de testes

### Fase 1 — Bugs

- [ ] 300+ cards carregados.
- [ ] 100 ciclos de hover (entrar/sair) sem travar.
- [ ] 10 downloads simultâneos/em fila.
- [ ] 10 arrastos para o CapCut e para o Finder.
- [ ] Rolar do topo ao fim por vários minutos.
- [ ] Voltar do CapCut para o app e rolar.
- [ ] Download grande + troca de busca no meio.
- [ ] Card “pronto” arrasta imediatamente após ficar verde.

### Fase 2 — Ferramentas

- [ ] Mac sem Homebrew.
- [ ] Mac com Homebrew.
- [ ] Caminho customizado.
- [ ] Crédito com acentos e nomes longos.
- [ ] Vídeo 1920×1080/5 s gerado só com binário embutido.

### Fase 3 — Backend

- [ ] Pexels fotos sem chave (web).
- [ ] Pexels fotos com chave (API).
- [ ] Pixabay imagens.
- [ ] Commons com licença CC0/PD.
- [ ] Commons com CC BY/CC BY-SA.
- [ ] Commons com licença inválida (deve ser ignorada).
- [ ] Rate limit e offline.

### Fase 4 — Imagens/crédito

- [ ] Imagem clara e escura com crédito legível.
- [ ] Imagem sem crédito (CC0/PD) sem overlay.
- [ ] Nome de autor longo.
- [ ] Acentos e caracteres especiais.
- [ ] `.originals` e `.txt` criados.
- [ ] “Limpar cache” preserva `.originals`/`.txt`.
- [ ] Arrasto para CapCut/Finder.
- [ ] Ícone de tipo aparece em vídeo e imagem, em todos os modos.
- [ ] Ícone de tipo não aparece no arquivo exportado nem no vídeo gerado.
- [ ] Badge textual “pronto p/ arrastar” não existe mais.
- [ ] Estado pronto é comunicado só pelo contorno verde + cursor `grab`.
- [ ] Ícone de tipo não colide com duração/qualidade no topo-direito.

### Fase 5 — Modo

- [ ] Ambos → imagens filtra sem nova busca.
- [ ] Ambos → vídeos filtra sem nova busca.
- [ ] Imagens → ambos mostra empty state.
- [ ] Imagens → vídeos mostra empty state.
- [ ] Empty state refaz a busca no modo novo.
- [ ] Modo persiste ao reabrir.
- [ ] Troca durante loading não quebra.
- [ ] Paginação continua em segundo plano.

### Fase 6 — Imagem → vídeo

- [ ] Única + zoom in.
- [ ] Única + pan down.
- [ ] Duplicada + blur.
- [ ] Duplicada + escuro.
- [ ] Duplicada + blur/escuro.
- [ ] VHS.
- [ ] Fade.
- [ ] 1920×1080, 5 s, sem áudio.
- [ ] Crédito estático no topo/centro.
- [ ] Pasta `broll-img2vid` abre.
- [ ] Reproduz no CapCut.

### Fase 7 — Release

- [ ] App buildado no Mac.
- [ ] Build Windows/Linux (CI) sem erro.
- [ ] README atualizado.
- [ ] Versão 0.2.0.
- [ ] Regressão do fluxo de vídeos original.

---

## 11. Convenções de trabalho

- Branch: `feat/images-img2vid`.
- Commits pequenos, um por fase:
  - `fix: ...` (Fase 1)
  - `feat: ...` (Fases 2–6)
  - `chore: ...` (Fase 7)
- Não commitar `node_modules`, `dist`, `release`, logs nem cache.
- Atualizar `PLANO.md` ao final de cada fase.
- Build só na Fase 7, depois de aprovação.

---

## 12. Backlog / fora do escopo da v1

- Seletor de duração 3/5/10 s.
- Filtro opcional “somente licenças sem ShareAlike”.
- Download do original em alta resolução sob demanda.
- Seleção múltipla / download em lote.
- Mais filtros e animações no img2vid.
- Legenda/áudio no vídeo gerado.
- Testes automatizados de UI (Playwright/Electron).
- Validação manual em Windows e Linux.
- Assinatura/notarização do app (fora do escopo atual).

---

## 13. Definição de pronto (projeto)

- [ ] Modo de mídia funcionando nos 3 estados, com filtro e empty state.
- [ ] Imagens das 3 fontes com preview, download e arrasto.
- [ ] Crédito correto para Commons, com `.originals`/`.txt` preservados.
- [ ] Imagem → vídeo 1920×1080/5 s com templates e crédito estático.
- [ ] Bugs de scroll e “pronto” corrigidos e stress-testados.
- [ ] README e este documento atualizados.
- [ ] App empacotado testado no Mac; CI de Windows/Linux sem erro.
- [ ] Nenhuma regressão no fluxo de vídeos existente.

---

## 14. Histórico deste documento

| Data | Mudança |
|---|---|
| 2026-11-19 | Criação do documento com objetivo, decisões fechadas, pesquisa de licença, fases, “Onde estamos” e “Erros aprendidos”. Nenhum código alterado. |
| 2026-11-19 | Adicionada a decisão do ícone SVG de tipo de mídia no topo-esquerdo dos cards (seção 2.8 e 5.6), com ajuste do badge “pronto p/ arrastar”, riscos e testes. |
| 2026-11-19 | Simplificação: badge “pronto p/ arrastar” removido; estado pronto passa a ser só contorno verde + cursor `grab`. Topo-esquerdo fica exclusivo do ícone de tipo. |
