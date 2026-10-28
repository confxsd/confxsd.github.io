# confxsd.github.io

Personal site, published by GitHub Pages from `main`.

## Publish an article

Add a Markdown file to `_articles/`, named after its URL, for example
`_articles/my-next-essay.md`:

```yaml
---
title: My next essay
date: 2026-10-28
description: A short description for search and link previews.
---

Write the article here in Markdown.
```

GitHub Pages builds `/articles/my-next-essay/` and adds it to the homepage,
newest first. The shared layout supplies the title, date, navigation,
and metadata. Existing Substack links remain in the archive.

Commit and push to `main` when ready to publish. No JavaScript or external CMS is
needed to read an article. Styles live in `articles/article.css`; the template is
`_layouts/article.html`.

## Local preview

With Ruby and Bundler installed:

```sh
bundle install
bundle exec jekyll serve
```

Open `http://localhost:4000`. Local build output and dependencies are ignored.
