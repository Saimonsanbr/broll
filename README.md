<img src="assets/icon.png" width="128" alt="broll">

# broll

Um programinha amador pra facilitar a busca de vídeos b-roll gratuitos (Pexels + Pixabay) e arrastar direto pra dentro do editor (testado no CapCut).

Como funciona: você pesquisa um termo, passa o mouse pra ver a prévia, clica uma vez pra baixar e arrasta o vídeo pronto pra dentro do editor. Simples assim.

> Projeto amador, feito pra uso pessoal, sem fins comerciais. Linux e Windows ainda **não foram testados** — se você testar, conta pra gente!

## Baixando

Na aba **Releases** aqui do GitHub tem versões prontas:

- **macOS Apple Silicon** (`-arm64.dmg`) — testado
- **macOS Intel** (`-x64.dmg`) — buildado no CI, precisa de confirmação
- **Windows** e **Linux** — buildados no CI, ainda não testados

## Rodando o código

Precisa do [Node 22](https://nodejs.org/).

```bash
npm install
npm run dev      # terminal 1 (interface)
npm start        # terminal 2 (app)
```

A chave do **Pixabay** é grátis e obrigatória (pegue em [pixabay.com/api/docs](https://pixabay.com/api/docs/)). A chave do **Pexels** é opcional — sem ela o app usa o modo web (veja abaixo). Cole as chaves na engrenagem do app → Salvar → Testar as chaves.

## Sobre o modo web do Pexels (importante ler)

O Pexels **pausou a emissão de chaves novas da API oficial** pra desenvolvedores novos. Como gambiarra temporária até eles voltarem a emitir chaves, o app tem um **modo web**: ele consulta o mesmo endpoint interno que o próprio site do Pexels usa no navegador (`api/v3/search/videos`), sem chave.

Pra não abusar, o modo web foi feito com cuidado:

- Só busca quando **você** pesquisa ou rola a tela (ritmo humano, nada de robô disparando request)
- Pausa de ~450ms entre buscas e paginação curta (12 por vez)
- Se o Pexels responder limite/bloqueio, o app entra em **pausa automática de ~90s** só pro Pexels e continua com o resto
- Thumbnails e resultados ficam em cache local

Mesmo assim, fique ciente: **esse caminho não é oficial**. Ele pode parar de funcionar do nada se o Pexels mudar o site, e o uso automatizado vai contra os [termos do Pexels](https://www.pexels.com/api/documentation/). Use com moderação, só pro seu uso pessoal. Se um dia você conseguir uma chave oficial, é só colar nas configurações que o app passa a usar a API oficial automaticamente.

O endpoint de conteúdo patrocinado (`getty-media`) foi deixado de fora de propósito — só entra conteúdo gratuito com licença livre.

## Posso usar os vídeos no YouTube? (segurança de licença)

Resposta curta: **sim, pode — sem precisar colocar nome nem link de ninguém no vídeo ou na descrição.**

- **Pexels:** a [licença](https://www.pexels.com/license/) libera tudo de graça, cita o YouTube nominalmente como uso permitido e **não exige atribuição** (só agradece se você der).
- **Pixabay:** a [licença de conteúdo](https://pixabay.com/service/terms/) também libera uso gratuito comercial e não-comercial **sem atribuição obrigatória**. O site mistura resultados patrocinados (Shutterstock/iStock, marcados com logo) no meio da busca — mas esses **não têm licença livre e não vêm pela API**, que retorna só a biblioteca gratuita. Mesmo assim, o app tem um **filtro defensivo**: qualquer resultado com sinal de patrocinado é descartado em silêncio (só aparece no log do app, nada muda pra você).
- **O crédito que aparece no app fica** — não é exigência pro seu vídeo, é exigência das **APIs**: Pexels e Pixabay pedem que o programa mostre a fonte dos resultados. No seu vídeo/descrição, o crédito é opcional.
- **Ressalvas que valem pras duas:** evite b-roll com pessoa reconhecível em contexto ofensivo/sensível ou marca/logo em destaque em vídeo comercial — nesses casos a licença joga a responsabilidade pra você. Pra b-roll típico (natureza, cidade, objetos), isso é irrelevante.

## Logs do app

Tudo que o app faz é registrado num arquivinho de log por dia (pasta de dados do app, mantém os últimos 7 dias) — busca, downloads, arrastos, filtros e erros. Nas configurações, o botão **Mostrar logs** (por último, lá embaixo) exibe o que rolou desde que o app foi aberto. Útil pra diagnosticar qualquer problema sem precisar de terminal.

## Licenças

- **Código do app:** [MIT](LICENSE) — pode usar, copiar e modificar à vontade.
- **Vídeos:** continuam pertencendo aos autores e às plataformas. Pexels ([licença](https://www.pexels.com/license/)) e Pixabay ([licença de conteúdo](https://pixabay.com/service/terms/)) liberam o uso gratuito, inclusive comercial, mas pedem crédito quando der. O app mostra o autor em cada vídeo com link pra página original — mantenha o crédito nos seus projetos.
