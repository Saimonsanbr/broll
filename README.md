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

## Licenças

- **Código do app:** [MIT](LICENSE) — pode usar, copiar e modificar à vontade.
- **Vídeos:** continuam pertencendo aos autores e às plataformas. Pexels ([licença](https://www.pexels.com/license/)) e Pixabay ([licença de conteúdo](https://pixabay.com/service/terms/)) liberam o uso gratuito, inclusive comercial, mas pedem crédito quando der. O app mostra o autor em cada vídeo com link pra página original — mantenha o crédito nos seus projetos.
