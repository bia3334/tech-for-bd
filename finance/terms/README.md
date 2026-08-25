Scratch space while a lesson is being written: each file adds the terms that lesson
introduces via `Object.assign(window.TERMS, {...})`. They get merged into
`finance/glossary.js` once the lesson lands, and the file here is deleted.
