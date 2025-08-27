import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { SavedVocabularyItem } from '../types';
import { checkSentenceGrammar, getExampleSentences } from '../services/geminiService';

interface NotebookViewProps {
    notebook: SavedVocabularyItem[];
    onUpdateNotebook: (notebook: SavedVocabularyItem[]) => void;
    onClose: () => void;
    onDelete: (id: string) => void;
    targetLanguage: string;
    sourceLanguage: string;
}

const Flashcard: React.FC<{ card: SavedVocabularyItem; onAnswer: (result: 'correct' | 'incorrect') => void }> = ({ card, onAnswer }) => {
    const [isFlipped, setIsFlipped] = useState(false);
    const [style, setStyle] = useState<React.CSSProperties>({});
    const cardRef = useRef<HTMLDivElement>(null);
    const dragStartPos = useRef<{ x: number } | null>(null);

    useEffect(() => {
        setIsFlipped(false);
        setStyle({ transform: 'translateX(0px) rotate(0deg)', transition: 'transform 0.5s' });
    }, [card]);

    const handleInteractionStart = (clientX: number) => {
        if (!cardRef.current) return;
        dragStartPos.current = { x: clientX };
        setStyle(prev => ({ ...prev, transition: 'none' }));
    };

    const handleInteractionMove = (clientX: number) => {
        if (!dragStartPos.current || !cardRef.current) return;
        const dx = clientX - dragStartPos.current.x;
        const rotation = dx / 20;
        setStyle(prev => ({ ...prev, transform: `translateX(${dx}px) rotate(${rotation}deg)` }));
    };

    const handleInteractionEnd = () => {
        if (!cardRef.current || !dragStartPos.current) return;
        
        const cardWidth = cardRef.current.offsetWidth;
        const transform = cardRef.current.style.transform;
        const dx = transform ? parseFloat(transform.split('(')[1]) : 0;

        const swipeThreshold = cardWidth * 0.4;

        if (dx > swipeThreshold) {
            setStyle({ transform: `translateX(${cardWidth * 1.5}px) rotate(45deg)`, transition: 'transform 0.3s ease-in' });
            setTimeout(() => onAnswer('correct'), 300);
        } else if (dx < -swipeThreshold) {
            setStyle({ transform: `translateX(-${cardWidth * 1.5}px) rotate(-45deg)`, transition: 'transform 0.3s ease-in' });
            setTimeout(() => onAnswer('incorrect'), 300);
        } else {
            setStyle({ transform: 'translateX(0px) rotate(0deg)', transition: 'transform 0.3s ease-out' });
        }
        dragStartPos.current = null;
    };


    return (
        <div className="w-full max-w-md mx-auto">
            <div className="relative h-64 perspective-1000">
                <div
                    ref={cardRef}
                    style={style}
                    className="absolute w-full h-full cursor-grab active:cursor-grabbing"
                    onMouseDown={(e) => handleInteractionStart(e.clientX)}
                    onMouseMove={(e) => (dragStartPos.current ? handleInteractionMove(e.clientX) : null)}
                    onMouseUp={handleInteractionEnd}
                    onMouseLeave={handleInteractionEnd}
                    onTouchStart={(e) => handleInteractionStart(e.touches[0].clientX)}
                    onTouchMove={(e) => (dragStartPos.current ? handleInteractionMove(e.touches[0].clientX) : null)}
                    onTouchEnd={handleInteractionEnd}
                 >
                    <div
                        className={`relative w-full h-full transition-transform duration-700 transform-style-3d ${isFlipped ? 'rotate-y-180' : ''}`}
                        onClick={() => !dragStartPos.current && setIsFlipped(!isFlipped)}
                    >
                        {/* Front */}
                        <div className="absolute w-full h-full backface-hidden bg-gray-700 rounded-xl flex flex-col justify-center items-center p-6 text-center">
                            <p className="text-gray-400 text-sm mb-2">Term</p>
                            <h3 className="text-3xl font-bold text-white">{card.word}</h3>
                        </div>
                        {/* Back */}
                        <div className="absolute w-full h-full backface-hidden bg-purple-800 rounded-xl flex flex-col justify-center items-center p-6 text-center rotate-y-180">
                            <p className="text-purple-200 text-sm mb-2">Translation</p>
                            <h3 className="text-3xl font-bold text-white">{card.translation}</h3>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};


const NotebookView: React.FC<NotebookViewProps> = ({ notebook, onUpdateNotebook, onClose, onDelete, targetLanguage, sourceLanguage }) => {
    const [filter, setFilter] = useState<'all' | 'today' | 'remembered' | 'difficult'>('all');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [isReviewing, setIsReviewing] = useState(false);
    const [isWriting, setIsWriting] = useState(false);
    const [currentCardIndex, setCurrentCardIndex] = useState(0);
    const [reviewList, setReviewList] = useState<SavedVocabularyItem[]>([]);

    const [writingList, setWritingList] = useState<SavedVocabularyItem[]>([]);
    const [currentWritingIndex, setCurrentWritingIndex] = useState(0);
    const [sentence, setSentence] = useState('');
    const [feedback, setFeedback] = useState<string | null>(null);
    const [correction, setCorrection] = useState<string | null>(null);
    const [examples, setExamples] = useState<string[]>([]);
    const [checking, setChecking] = useState(false);

    const filteredNotebook = useMemo(() => {
        const todayStr = new Date().toDateString();
        return notebook.filter(item => {
            switch (filter) {
                case 'today':
                    return new Date(item.dateAdded).toDateString() === todayStr;
                case 'remembered':
                    return item.correctCount > item.incorrectCount;
                case 'difficult':
                    return item.incorrectCount > item.correctCount;
                default:
                    return true;
            }
        });
    }, [notebook, filter]);

    const groupedByDate = useMemo(() => {
        return filteredNotebook.reduce((acc, item) => {
            const date = new Date(item.dateAdded).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
            if (!acc[date]) {
                acc[date] = [];
            }
            acc[date].push(item);
            return acc;
        }, {} as Record<string, SavedVocabularyItem[]>);
    }, [filteredNotebook]);

    const selectedItems = useMemo(() => filteredNotebook.filter(item => selectedIds.has(item.id)), [filteredNotebook, selectedIds]);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const selectAllFiltered = () => {
        setSelectedIds(new Set(filteredNotebook.map(i => i.id)));
    };

    const loadExamples = async (item: SavedVocabularyItem) => {
        try {
            const ex = await getExampleSentences(item.translation, targetLanguage, 3);
            setExamples(ex);
        } catch (e) {
            console.error('Failed to fetch examples', e);
            setExamples([]);
        }
    };

    const startReview = () => {
        const items = selectedItems.length ? selectedItems : filteredNotebook;
        if (items.length > 0) {
            setReviewList([...items].sort(() => Math.random() - 0.5));
            setCurrentCardIndex(0);
            setIsReviewing(true);
        }
    };

    const startWriting = async () => {
        const items = selectedItems.length ? selectedItems : filteredNotebook;
        if (items.length > 0) {
            setWritingList([...items]);
            setCurrentWritingIndex(0);
            setIsWriting(true);
            await loadExamples(items[0]);
        }
    };

    const handleExport = useCallback(() => {
        if (notebook.length === 0) {
            alert("Notebook is empty.");
            return;
        }
        const jsonString = JSON.stringify(notebook, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gemini-adventure-notebook-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, [notebook]);

    const handleImport = useCallback(() => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.onchange = (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = e.target?.result as string;
                    const importedItems = JSON.parse(text) as SavedVocabularyItem[];
                    
                    if (!Array.isArray(importedItems) || !importedItems.every(item => item.id && item.word && item.translation && item.dateAdded)) {
                         throw new Error("Invalid notebook file format.");
                    }
                     
                    const sanitizedImportedItems = importedItems.map(item => ({
                        ...item,
                        correctCount: item.correctCount || 0,
                        incorrectCount: item.incorrectCount || 0,
                        sourceLanguage: item.sourceLanguage || sourceLanguage,
                    }));
                    
                    const combined = [...notebook, ...sanitizedImportedItems];
                    const uniqueItems = Array.from(new Map(combined.map(item => [item.word.toLowerCase(), item])).values());
                    
                    onUpdateNotebook(uniqueItems.sort((a,b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()));
                    alert(`${importedItems.length} items imported successfully!`);
                } catch (err) {
                    console.error("Failed to import notebook:", err);
                    alert("Failed to import notebook. Please check the file format.");
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }, [notebook, onUpdateNotebook]);

    const handleNextCard = () => {
        setCurrentCardIndex(prev => (prev + 1) % reviewList.length);
    };

    const handleAnswer = (result: 'correct' | 'incorrect') => {
        const card = reviewList[currentCardIndex];
        const newNotebook = notebook.map(item => {
            if (item.id === card.id) {
                return {
                    ...item,
                    correctCount: item.correctCount + (result === 'correct' ? 1 : 0),
                    incorrectCount: item.incorrectCount + (result === 'incorrect' ? 1 : 0),
                };
            }
            return item;
        });
        onUpdateNotebook(newNotebook);
        handleNextCard();
    };

    const currentWritingItem = writingList[currentWritingIndex];

    const handleCheckGrammar = async () => {
        if (!currentWritingItem || !sentence.trim()) return;
        setChecking(true);
        setFeedback(null);
        setCorrection(null);
        try {
            const result = await checkSentenceGrammar(sentence, currentWritingItem.translation, targetLanguage);
            setFeedback(result.feedback);
            setCorrection(result.correction);
        } catch (err) {
            console.error('Grammar check failed', err);
            setFeedback('Grammar check failed. Please try again.');
        } finally {
            setChecking(false);
        }
    };

    const handleNextWriting = async () => {
        if (writingList.length === 0) return;
        const next = (currentWritingIndex + 1) % writingList.length;
        setCurrentWritingIndex(next);
        setSentence('');
        setFeedback(null);
        setCorrection(null);
        await loadExamples(writingList[next]);
    };

    const handleForgot = async () => {
        await handleNextWriting();
    };

    const getPerformanceColor = (item: SavedVocabularyItem) => {
        const { correctCount, incorrectCount } = item;
        const total = correctCount + incorrectCount;

        if (total === 0) return 'text-white';
        if (incorrectCount > correctCount && incorrectCount >= 3) return 'text-red-400';
        if (incorrectCount > 0 && incorrectCount >= (correctCount / 2)) return 'text-yellow-400';
        if (correctCount > incorrectCount && correctCount >= 5) return 'text-green-400';
        return 'text-gray-300';
    };

    useEffect(() => {
        if (!isReviewing) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') { e.preventDefault(); handleAnswer('correct'); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); handleAnswer('incorrect'); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isReviewing, currentCardIndex, reviewList]);

    useEffect(() => {
        if (!isWriting) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight') { e.preventDefault(); handleNextWriting(); }
            if (e.key === 'ArrowLeft') { e.preventDefault(); handleForgot(); }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isWriting, currentWritingIndex, writingList]);

    if (isReviewing) {
        return (
            <div className="p-4 md:p-8">
                <h2 className="text-3xl font-bold text-purple-300 mb-2 text-center">Flashcard Review</h2>
                <div className="text-center text-gray-400 mb-6 max-w-md mx-auto">
                    <p>Click the card to see the translation.</p>
                    <p><strong>Swipe right if you remembered, swipe left if you didn't.</strong></p>
                </div>
                {reviewList.length > 0 ? (
                   <Flashcard card={reviewList[currentCardIndex]} onAnswer={handleAnswer} />
                ) : (
                    <p className="text-center text-gray-500">No cards to review.</p>
                )}
                <button onClick={() => setIsReviewing(false)} className="mt-8 block mx-auto text-gray-400 hover:text-white">Exit Review</button>
            </div>
        )
    }

    if (isWriting && currentWritingItem) {
        return (
            <div className="p-4 md:p-8">
                <h2 className="text-3xl font-bold text-purple-300 mb-2 text-center">Writing Practice</h2>
                <div className="text-center text-gray-400 mb-4">
                    <p>Use the word <strong>{currentWritingItem.translation}</strong> in a sentence.</p>
                </div>
                {examples.length > 0 && (
                    <ul className="text-sm text-gray-400 mb-4 list-disc list-inside">
                        {examples.map((ex, idx) => (
                            <li key={idx}>{ex}</li>
                        ))}
                    </ul>
                )}
                <textarea
                    value={sentence}
                    onChange={(e) => setSentence(e.target.value)}
                    className="w-full h-24 p-2 rounded bg-gray-700 text-white"
                />
                {feedback && <p className="mt-2 text-sm text-gray-300">{feedback}</p>}
                {correction && <p className="mt-1 text-sm text-green-300">{correction}</p>}
                <div className="flex justify-end gap-2 mt-4">
                    <button onClick={handleForgot} className="text-gray-400 hover:text-white">Forgot</button>
                    <button onClick={handleCheckGrammar} disabled={checking} className="bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg">{checking ? 'Checking...' : 'Check Grammar'}</button>
                    <button onClick={handleNextWriting} className="bg-gray-600 hover:bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg">Next</button>
                </div>
                <button onClick={() => setIsWriting(false)} className="mt-8 block mx-auto text-gray-400 hover:text-white">Exit Writing</button>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-purple-300">Vocabulary Notebook</h2>
                <button onClick={onClose} className="bg-gray-800/70 hover:bg-gray-700/90 text-purple-300 font-semibold py-2 px-4 border border-gray-600/80 rounded-lg shadow-md transition-all">Back to Game</button>
            </div>
            
            <div className="flex gap-3 mb-6">
                <button onClick={handleImport} className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">Import Notebook</button>
                <button onClick={handleExport} className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">Export Notebook</button>
            </div>

              {notebook.length > 0 ? (
                   <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-4">
                      <div className="flex items-center gap-2 mb-4">
                          <select value={filter} onChange={(e) => { setFilter(e.target.value as any); setSelectedIds(new Set()); }} className="bg-gray-700 text-white p-2 rounded">
                              <option value="all">All Words</option>
                              <option value="today">Added Today</option>
                              <option value="remembered">Remembered</option>
                              <option value="difficult">Needs Practice</option>
                          </select>
                          <button onClick={selectAllFiltered} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded">Select All</button>
                      </div>
                      <div className="flex gap-2 mb-4">
                          <button onClick={startReview} disabled={selectedItems.length === 0} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition-colors">Flashcards ({selectedItems.length})</button>
                          <button onClick={startWriting} disabled={selectedItems.length === 0} className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-lg transition-colors">Writing ({selectedItems.length})</button>
                      </div>

                      {Object.entries(groupedByDate).map(([date, items]) => (
                          <div key={date}>
                              <h3 className="text-lg font-semibold text-gray-400 mb-2">{date}</h3>
                              <ul className="bg-gray-800/50 rounded-lg p-4 space-y-3">
                                  {items.map((item) => (
                                      <li key={item.id} className="flex justify-between items-center">
                                          <label className="flex items-center gap-2">
                                              <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)} />
                                              <div>
                                                  <span className={`font-bold transition-colors ${getPerformanceColor(item)}`}>{item.word}</span>
                                                  <span className="text-gray-400"> - {item.translation}</span>
                                              </div>
                                          </label>
                                          <div className="flex items-center gap-4">
                                              <span className="text-xs text-gray-500 font-mono">
                                                  <span title="Times remembered" className="text-green-500">✓{item.correctCount}</span> | <span title="Times not remembered" className="text-red-500">✗{item.incorrectCount}</span>
                                              </span>
                                              <button onClick={() => onDelete(item.id)} className="text-red-400 hover:text-red-300 text-xs font-sans uppercase tracking-wider">Remove</button>
                                          </div>
                                      </li>
                                  ))}
                              </ul>
                          </div>
                      ))}
                   </div>
              ) : (
                  <p className="text-center text-gray-400 py-12">Your notebook is empty. Save new words from your adventure!</p>
              )}
        </div>
    );
};

export default NotebookView;