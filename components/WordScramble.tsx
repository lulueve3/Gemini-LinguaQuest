import React, { useEffect, useState } from 'react';
import { SavedVocabularyItem } from '../types';

interface WordScrambleProps {
  cards: SavedVocabularyItem[];
  onAnswer: (id: string, result: 'correct' | 'incorrect') => void;
  onComplete: () => void;
}

const shuffle = (arr: string[]) => arr.sort(() => Math.random() - 0.5);

const WordScramble: React.FC<WordScrambleProps> = ({ cards, onAnswer, onComplete }) => {
  const [index, setIndex] = useState(0);
  const [letters, setLetters] = useState<string[]>([]);
  const [input, setInput] = useState<string[]>([]);
  const [attempted, setAttempted] = useState(false);
  const [showResult, setShowResult] = useState<'correct' | 'incorrect' | null>(null);

  useEffect(() => {
    const word = cards[index]?.word || '';
    setLetters(shuffle(word.split('')));
    setInput([]);
    setAttempted(false);
    setShowResult(null);
  }, [index, cards]);

  const handleLetterClick = (i: number) => {
    setInput([...input, letters[i]]);
    setLetters(letters.filter((_, idx) => idx !== i));
  };

  const handleRemove = (i: number) => {
    const letter = input[i];
    setInput(input.filter((_, idx) => idx !== i));
    setLetters([...letters, letter]);
  };

  const handleDelete = () => {
    if (input.length === 0) return;
    const letter = input[input.length - 1];
    setInput(input.slice(0, -1));
    setLetters([...letters, letter]);
  };

  useEffect(() => {
    const word = cards[index]?.word;
    if (word && input.length === word.length) {
      const result: 'correct' | 'incorrect' = input.join('') === word ? 'correct' : 'incorrect';
      if (!attempted) {
        onAnswer(cards[index].id, result);
      }
      setAttempted(true);
      setShowResult(result);
    }
  }, [input]);

  const handleForgot = () => {
    if (!attempted) {
      onAnswer(cards[index].id, 'incorrect');
    }
    setAttempted(true);
    setShowResult('incorrect');
    setInput(cards[index].word.split(''));
    setLetters([]);
  };

  const next = () => {
    if (index + 1 >= cards.length) {
      onComplete();
    } else {
      setIndex(i => i + 1);
    }
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && showResult) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showResult, index, cards.length]);

  const current = cards[index];
  if (!current) return null;

  return (
    <div className="max-w-md mx-auto text-center select-none">
      <h3 className="text-xl font-bold mb-4">Arrange the letters</h3>
      <p className="mb-4 text-gray-400">Meaning: {current.translation}</p>
      <div className="flex flex-wrap justify-center gap-2 mb-4">
        {input.map((l, i) => (
          <button
            key={i}
            onClick={() => handleRemove(i)}
            className="px-3 py-2 bg-purple-600 text-white rounded"
          >
            {l}
          </button>
        ))}
        {input.length === 0 && <div className="min-h-[2rem]"></div>}
      </div>
      {!showResult && (
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          {letters.map((l, i) => (
            <button
              key={i}
              onClick={() => handleLetterClick(i)}
              className="px-3 py-2 bg-gray-700 text-white rounded"
            >
              {l}
            </button>
          ))}
        </div>
      )}
      <div className="flex justify-center gap-3 mb-4">
        <button onClick={handleDelete} className="px-3 py-1 bg-gray-700 text-white rounded">
          Delete
        </button>
        <button onClick={handleForgot} className="px-3 py-1 bg-gray-700 text-white rounded">
          Forget
        </button>
      </div>
      {showResult && (
        <div className="mb-4">
          {showResult === 'correct' ? (
            <p className="text-green-400 font-bold">Chính xác!</p>
          ) : (
            <p className="text-red-400 font-bold">Thử lại!</p>
          )}
        </div>
      )}
      {showResult && (
        <button onClick={next} className="px-4 py-2 bg-purple-600 text-white rounded">
          Next ➜
        </button>
      )}
    </div>
  );
};

export default WordScramble;
