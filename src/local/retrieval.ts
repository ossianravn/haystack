import type { Passage } from '../core/types';

// Function words do not carry a search concept. The complete original query is
// also matched as a phrase, so quoted/common-word expressions remain searchable.
const functionWords = new Set(`a an and are as at be been but by can could did do does for from had has have how i if in into is it its may me my of on or our should so than that the their them then there these they this those to was we were what when where which who why will with would you your
af alle at blev blive da de dem den denne der deres det dette dig din dine disse dog du eller en end er et for fra få får har have havde hende her hvad hvem hvor hvordan hvorfor hvis i ikke ind jeg kan kunne man med men mig min mine må ned noget nogle nu når og om op os over på sig sin sine skal skulle som til ud under var ved vi vil ville være været`.split(/\s+/));

function words(text: string): string[] {
  return text.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function contains(source: string[], term: string[]): boolean {
  return term.length > 0 && source.some((_, start) =>
    term.every((word, offset) => /^\d+$/.test(word) ? source[start + offset] === word : source[start + offset]?.startsWith(word)));
}

/** Every lexical candidate is verified; there is no top-N result cutoff. */
export function retrieve(passages: Passage[], query: string, keywords: string): Passage[] {
  const concepts = words(`${query} ${keywords}`).filter((word) => !functionWords.has(word));
  const phrases = [...new Set([words(query).join(' '), ...concepts])].filter(Boolean).map(words);
  const indexed = passages.map((passage) => ({ passage, words: words(passage.text) }));
  const hits = indexed.map((source) => phrases.map((phrase) => contains(source.words, phrase)));
  const frequency = phrases.map((_, index) => hits.filter((hit) => hit[index]).length);
  return indexed.map(({ passage }, index) => ({ passage,
    // Prefer specific evidence while retaining every candidate for verification.
    score: hits[index].reduce((score, hit, term) => score + (hit ? 1 / frequency[term] : 0), 0),
  })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).map(({ passage }) => passage);
}
