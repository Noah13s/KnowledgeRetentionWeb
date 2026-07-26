import { useCallback, useEffect } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import './CategoryEditor.css';
import GridList from '../../components/GridList';
import ImagePage from './ImageLibrary';
import { usePersistentState } from '../../lib/usePersistentState';
import QuizEditor from './QuizEditor';
import QuizPlayer from './QuizPlayer';

interface Category {
  Name: string;
  Description: string;
  ImageFile: string;
  quizFiles: string[];
  subCategories: Category[];
}

interface Quiz {
  quizName: string;
  questionType: string;
  question: string;
  questionImage: string;
  webSearch: string;
  answerType: string;
  inputAnswerType: string;
  inputAnswer: string;
  category: string;
  answers: any[];
}

function normalizeCategoryPath(value: string) {
  return value.replace(/\/+/g, '/').replace(/\/$/, '').trim();
}

function shuffleArray<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

async function loadJsonFilesRecursively(
  path: string,
  directory: Directory
): Promise<any[]> {
  const entries = await Filesystem.readdir({ path, directory });
  const results: any[] = [];
  for (const entry of entries.files) {
    const childPath = path ? `${path}/${entry.name}` : entry.name;
    if (entry.type === 'directory') {
      const nested = await loadJsonFilesRecursively(childPath, directory);
      results.push(...nested);
      continue;
    }
    if (entry.name.toLowerCase().endsWith('.json')) {
      const file = await Filesystem.readFile({
        path: childPath,
        directory,
        encoding: Encoding.UTF8,
      });
      results.push(JSON.parse(file.data as string));
    }
  }
  return results;
}

export default function CategoryPage() {
  const [externalBasePath, setExternalBasePath] = usePersistentState<string>('categoryEditor.externalBasePath', '');
  const [categories, setCategories] = usePersistentState<Category[]>('categoryEditor.categories', []);
  const [quizzes, setQuizzes] = usePersistentState<Quiz[]>('categoryEditor.quizzes', []);
  const [availableQuizzes, setAvailableQuizzes] = usePersistentState<Quiz[]>('categoryEditor.availableQuizzes', []);
  const [selectedQuizNames, setSelectedQuizNames] = usePersistentState<string[]>('categoryEditor.selectedQuizNames', []);
  const [selectedNames, setSelectedNames] = usePersistentState<string[]>('categoryEditor.selectedNames', []);
  const [isSelectionMode, setIsSelectionMode] = usePersistentState<boolean>('categoryEditor.isSelectionMode', false);
  const [categoryPath, setCategoryPath] = usePersistentState<string[]>('categoryEditor.categoryPath', []);
  const [addedCategoryPaths, setAddedCategoryPaths] = usePersistentState<string[]>('categoryEditor.addedCategoryPaths', []);
  const [isPickingImage, setIsPickingImage] = usePersistentState<boolean>('categoryEditor.isPickingImage', false);
  const [hasLoaded, setHasLoaded] = usePersistentState<boolean>('categoryEditor.hasLoaded', false);
  const [isEditingQuiz, setIsEditingQuiz] = usePersistentState<boolean>('categoryEditor.isEditingQuiz', false);
  const [editingQuiz, setEditingQuiz] = usePersistentState<Quiz | null>('categoryEditor.editingQuiz', null);
  const [isPlayingQuiz, setIsPlayingQuiz] = usePersistentState<boolean>('categoryEditor.isPlayingQuiz', false);
  const [quizPlayCount, setQuizPlayCount] = usePersistentState<number | 'all'>('categoryEditor.quizPlayCount', 5);
  const [randomizeQuizzes, setRandomizeQuizzes] = usePersistentState<boolean>('categoryEditor.randomizeQuizzes', false);
  const [quizzesForPlayer, setQuizzesForPlayer] = usePersistentState<Quiz[]>('categoryEditor.quizzesForPlayer', []);
  useEffect(() => {
    if (hasLoaded) return; // already loaded in a previous mount, keep current state
    const run = async () => {
      try {
        const uriResult = await Filesystem.getUri({
          path: '',
          directory: Directory.External
        });
        setExternalBasePath(uriResult.uri);
      } catch (e) {
        console.error("Failed to get external base path", e);
      }
      try {
        const categoriesFile = await Filesystem.readFile({
          path: 'categories.json',
          directory: Directory.External,
          encoding: Encoding.UTF8,
        });
        const parsedCategories = JSON.parse(categoriesFile.data as string);
        setCategories(parsedCategories.categories ?? []);
      } catch (err: any) {
        console.warn('categories.json not found, starting empty:', err);
        setCategories([]);
        try {
          await Filesystem.writeFile({
            path: 'categories.json',
            directory: Directory.External,
            encoding: Encoding.UTF8,
            data: JSON.stringify({ categories: [] }, null, 2),
          });
          console.log('Created empty categories.json');
        } catch (createErr) {
          console.error('Failed to create categories.json:', createErr);
        }
      }
      try {
        const quizObjects = await loadJsonFilesRecursively(
          'quizzes',
          Directory.External
        );
        setQuizzes(
          quizObjects.flatMap((x) => (Array.isArray(x) ? x : [x]))
        );
      } catch (err: any) {
        console.warn('No quizzes folder found, starting empty:', err);
        setQuizzes([]);
        try {
          await Filesystem.mkdir({
            path: 'quizzes',
            directory: Directory.External,
            recursive: true,
          });
          console.log('Created quizzes folder');
        } catch (mkdirErr) {
          console.error('Failed to create quizzes folder:', mkdirErr);
        }
      }
      setHasLoaded(true);
    };
    run();
  }, [hasLoaded]);

  useEffect(() => {
    setSelectedNames([]);
    setIsSelectionMode(false);
  }, [categoryPath]);

  const currentCategories = (() => {
    let currentList = categories;
    for (const segment of categoryPath) {
      const found = currentList.find((cat) => cat.Name === segment);
      if (found) {
        currentList = found.subCategories ?? [];
      } else {
        break;
      }
    }
    return currentList;
  })();

  const getFullPath = (name: string) =>
    normalizeCategoryPath([...categoryPath, name].join('/'));

  const openCategory = (category: Category) => {
    setCategoryPath((prev) => [...prev, category.Name]);
  };

  const goBack = useCallback(() => {
    setCategoryPath((prev) => prev.slice(0, -1));
    setIsSelectionMode(false);
    setSelectedNames([]);
  }, [setCategoryPath, setIsSelectionMode, setSelectedNames]);

  useEffect(() => {
    if (categoryPath.length === 0 || isPickingImage || isEditingQuiz || isPlayingQuiz) return;
    const listenerPromise = CapacitorApp.addListener('backButton', goBack);
    return () => {
      listenerPromise.then((listener) => listener.remove());
    };
  }, [categoryPath, goBack, isPickingImage, isEditingQuiz, isPlayingQuiz]);

  const handleItemInteraction = (category: Category) => {
    if (isSelectionMode) {
      setSelectedNames((prev) =>
        prev.includes(category.Name)
          ? prev.filter((name) => name !== category.Name)
          : [...prev, category.Name]
      );
    } else {
      openCategory(category);
    }
  };

  async function createCategory() {
    const categoryName = window.prompt("Enter a new name:");
    if (!categoryName) return;

    if (currentCategories.some(cat => cat.Name.toLowerCase() === categoryName.toLowerCase().trim())) {
      alert("A category with this name already exists in this folder.");
      return;
    }

    const newCategory: Category = {
      Name: categoryName.trim(),
      Description: "",
      ImageFile: "",
      quizFiles: [],
      subCategories: []
    };

    const updateTree = (list: Category[], pathIndex: number): Category[] => {
      if (pathIndex >= categoryPath.length) {
        return [...list, newCategory];
      }
      const targetName = categoryPath[pathIndex];
      return list.map((cat) => {
        if (cat.Name === targetName) {
          return {
            ...cat,
            subCategories: updateTree(cat.subCategories ?? [], pathIndex + 1),
          };
        }
        return cat;
      });
    };

    const updatedCategories = updateTree(categories, 0);

    setCategories(updatedCategories);

    try {
      await Filesystem.writeFile({
        path: 'categories.json',
        directory: Directory.External,
        encoding: Encoding.UTF8,
        data: JSON.stringify({ categories: updatedCategories }, null, 2),
      });
      console.log("Successfully created and saved new category:", newCategory.Name);
    } catch (err) {
      console.error("Failed to write updated categories structure to disk:", err);
      alert("Could not save new category to device storage.");
    }
  }

  const handleLongPress = (category: Category) => {
    console.log("Long pressed:", category.Name);
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedNames([category.Name]);
    }
  };

  function cancelSelection() {
    setIsSelectionMode(false);
    setSelectedNames([]);
  }

  async function deleteCategories() {
    if (selectedNames.length === 0) return;

    const confirmDelete = window.confirm(`Are you sure you want to delete the ${selectedNames.length} selected item(s)?`);
    if (!confirmDelete) return;

    const deleteFromTree = (list: Category[], pathIndex: number): Category[] => {
      if (pathIndex >= categoryPath.length) {
        return list.filter((cat) => !selectedNames.includes(cat.Name));
      }
      const targetName = categoryPath[pathIndex];
      return list.map((cat) => {
        if (cat.Name === targetName) {
          return {
            ...cat,
            subCategories: deleteFromTree(cat.subCategories ?? [], pathIndex + 1),
          };
        }
        return cat;
      });
    };

    const updatedCategories = deleteFromTree(categories, 0);
    setCategories(updatedCategories);
    cancelSelection();

    try {
      await Filesystem.writeFile({
        path: 'categories.json',
        directory: Directory.External,
        encoding: Encoding.UTF8,
        data: JSON.stringify({ categories: updatedCategories }, null, 2),
      });
      console.log("Deleted successfully.");
    } catch (err) {
      console.error("Failed to save changes after deletion:", err);
      alert("Could not save changes to storage.");
    }
  }

  async function renameCategory() {
    if (selectedNames.length !== 1) return;
    const oldName = selectedNames[0];

    const newName = window.prompt("Enter a new name for this category:", oldName);
    if (!newName || newName.trim() === oldName) return;
    const cleanNewName = newName.trim();

    if (currentCategories.some(cat => cat.Name.toLowerCase() === cleanNewName.toLowerCase() && cat.Name !== oldName)) {
      alert("A category with this name already exists in this folder.");
      return;
    }

    const renameInTree = (list: Category[], pathIndex: number): Category[] => {
      if (pathIndex >= categoryPath.length) {
        return list.map((cat) => {
          if (cat.Name === oldName) {
            return { ...cat, Name: cleanNewName };
          }
          return cat;
        });
      }
      const targetName = categoryPath[pathIndex];
      return list.map((cat) => {
        if (cat.Name === targetName) {
          return {
            ...cat,
            subCategories: renameInTree(cat.subCategories ?? [], pathIndex + 1),
          };
        }
        return cat;
      });
    };

    const updatedCategories = renameInTree(categories, 0);
    setCategories(updatedCategories);
    cancelSelection();

    try {
      await Filesystem.writeFile({
        path: 'categories.json',
        directory: Directory.External,
        encoding: Encoding.UTF8,
        data: JSON.stringify({ categories: updatedCategories }, null, 2),
      });
      console.log("Renamed successfully.");
    } catch (err) {
      console.error("Failed to save changes after rename:", err);
      alert("Could not save changes to storage.");
    }
  }

  function startQuiz() {
    let list = [...availableQuizzes];
    if (randomizeQuizzes) {
      list = shuffleArray(list);
    }
    const count = quizPlayCount === 'all' ? list.length : Math.min(quizPlayCount, list.length);
    setQuizzesForPlayer(list.slice(0, count));
    setIsPlayingQuiz(true);
  }

  function selectQuizzesFromCategories() {
    if (selectedNames.length === 0) return;
    const selectedFullPaths = selectedNames.map(getFullPath);
    console.log('[selectQuizzesFromCategories] selectedFullPaths:', selectedFullPaths);
    const matched = quizzes.filter((quiz) => {
      const quizCategory = normalizeCategoryPath(quiz.category ?? '');
      const isMatch = selectedFullPaths.some(
        (selectedPath) =>
          quizCategory === selectedPath || quizCategory.startsWith(`${selectedPath}/`)
      );
      return isMatch;
    });
    console.log('[selectQuizzesFromCategories] matched quizzes:', matched);
    setAvailableQuizzes((prev) => {
      const merged = [...prev, ...matched];
      const seen = new Set<string>();
      return merged.filter((q) => {
        const key = `${normalizeCategoryPath(q.category)}::${q.quizName}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
    setAddedCategoryPaths((prev) => Array.from(new Set([...prev, ...selectedFullPaths])));
    cancelSelection();
  }

  function deselectQuizzesFromCategories() {
    if (selectedNames.length === 0) return;
    const selectedFullPaths = selectedNames.map(getFullPath);

    const belongsToSelection = (quiz: Quiz) => {
      const quizCategory = normalizeCategoryPath(quiz.category ?? '');
      return selectedFullPaths.some(
        (selectedPath) =>
          quizCategory === selectedPath || quizCategory.startsWith(`${selectedPath}/`)
      );
    };

    const removedKeys = new Set(
      availableQuizzes.filter(belongsToSelection).map(quizKey)
    );

    setAvailableQuizzes((prev) => prev.filter((q) => !belongsToSelection(q)));
    setSelectedQuizNames((prev) => prev.filter((key) => !removedKeys.has(key)));
    setAddedCategoryPaths((prev) =>
      prev.filter((p) => !selectedFullPaths.includes(p))
    );
    cancelSelection();
  }

  function clearAllSelections() {
    setAvailableQuizzes([]);
    setAddedCategoryPaths([]);
    setSelectedQuizNames([]);
  }

  const quizKey = (quiz: Quiz) => `${quiz.category}::${quiz.quizName}`;

  const selectedFullPaths = selectedNames.map(getFullPath);
  const hasNonConfirmedSelected = selectedFullPaths.some(
    (p) => !addedCategoryPaths.includes(p)
  );
  const isDeselectMode = selectedNames.length > 0 && !hasNonConfirmedSelected;

  async function handleImagePicked(imagePath: string) {
    setIsPickingImage(false);
    if (selectedNames.length !== 1) return;
    const targetName = selectedNames[0];

    const updateTree = (list: Category[], pathIndex: number): Category[] => {
      if (pathIndex >= categoryPath.length) {
        return list.map((cat) =>
          cat.Name === targetName ? { ...cat, ImageFile: imagePath } : cat
        );
      }
      const targetPathName = categoryPath[pathIndex];
      return list.map((cat) => {
        if (cat.Name === targetPathName) {
          return {
            ...cat,
            subCategories: updateTree(cat.subCategories ?? [], pathIndex + 1),
          };
        }
        return cat;
      });
    };

    const updatedCategories = updateTree(categories, 0);
    setCategories(updatedCategories);
    cancelSelection();

    try {
      await Filesystem.writeFile({
        path: 'categories.json',
        directory: Directory.External,
        encoding: Encoding.UTF8,
        data: JSON.stringify({ categories: updatedCategories }, null, 2),
      });
      console.log("Image set successfully.");
    } catch (err) {
      console.error("Failed to save changes after setting image:", err);
      alert("Could not save changes to storage.");
    }
  }

  function handleImagePickCancel() {
    setIsPickingImage(false);
  }

  function openQuizEditor(quiz: Quiz | null) {
    setEditingQuiz(quiz);
    setIsEditingQuiz(true);
  }

  function handleQuizEditorCancel() {
    setIsEditingQuiz(false);
    setEditingQuiz(null);
  }

  async function handleQuizEditorSave(quiz: Quiz, originalQuiz: Quiz | null) {
    try {
      const fileName = `quizzes/${quiz.category}/${quiz.quizName}.json`.replace(/\/+/g, '/');
      await Filesystem.writeFile({
        path: fileName,
        directory: Directory.External,
        encoding: Encoding.UTF8,
        data: JSON.stringify(quiz, null, 2),
        recursive: true,
      });

      if (originalQuiz && (originalQuiz.quizName !== quiz.quizName || originalQuiz.category !== quiz.category)) {
        const oldFileName = `quizzes/${originalQuiz.category}/${originalQuiz.quizName}.json`.replace(/\/+/g, '/');
        try {
          await Filesystem.deleteFile({ path: oldFileName, directory: Directory.External });
        } catch (e) {
          console.warn('Old quiz file not found, nothing to clean up:', e);
        }
      }

      setQuizzes((prev) => {
        const withoutOld = originalQuiz ? prev.filter((q) => quizKey(q) !== quizKey(originalQuiz)) : prev;
        return [...withoutOld, quiz];
      });
      setAvailableQuizzes((prev) => {
        const withoutOld = originalQuiz ? prev.filter((q) => quizKey(q) !== quizKey(originalQuiz)) : prev;
        return [...withoutOld, quiz];
      });

      setIsEditingQuiz(false);
      setEditingQuiz(null);
    } catch (err) {
      console.error('Failed to save quiz:', err);
      alert('Could not save the quiz to device storage.');
    }
  }

  async function handleQuizEditorDelete(quiz: Quiz) {
    const confirmDelete = window.confirm(`Delete "${quiz.quizName}"?`);
    if (!confirmDelete) return;
    try {
      const fileName = `quizzes/${quiz.category}/${quiz.quizName}.json`.replace(/\/+/g, '/');
      await Filesystem.deleteFile({ path: fileName, directory: Directory.External });
    } catch (e) {
      console.warn('Quiz file not found, nothing to delete on disk:', e);
    }
    setQuizzes((prev) => prev.filter((q) => quizKey(q) !== quizKey(quiz)));
    setAvailableQuizzes((prev) => prev.filter((q) => quizKey(q) !== quizKey(quiz)));
    setIsEditingQuiz(false);
    setEditingQuiz(null);
  }
  if (isPickingImage) {
    return (
      <ImagePage
        mode="picker"
        onPick={handleImagePicked}
        onCancel={handleImagePickCancel}
      />
    );
  }
  if (isEditingQuiz) {
    return (
      <QuizEditor
        initialQuiz={editingQuiz}
        defaultCategory={editingQuiz ? editingQuiz.category : normalizeCategoryPath(categoryPath.join('/'))}
        externalBasePath={externalBasePath}
        onSave={handleQuizEditorSave}
        onDelete={editingQuiz ? handleQuizEditorDelete : undefined}
        onCancel={handleQuizEditorCancel}
      />
    );
  }
  if (isPlayingQuiz) {
    return (
      <QuizPlayer
        quizzes={quizzesForPlayer}
        externalBasePath={externalBasePath}
        onExit={() => setIsPlayingQuiz(false)}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: "5px", padding: "10px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", justifyContent: "center" }}>
        {isSelectionMode ? (
          <>
            <button style={{ backgroundColor: "#e74c3c", color: "white" }} onClick={cancelSelection}>
              Cancel Selection
            </button>
            {/* Disabled states added based on your requirements */}
            <button disabled={selectedNames.length === 0} onClick={deleteCategories}>Delete</button>
            <button disabled={selectedNames.length !== 1} onClick={renameCategory}>Rename</button>
            <button disabled={selectedNames.length !== 1} onClick={() => setIsPickingImage(true)}>
              Set image
            </button>
          </>
        ) : (
          <>
            <button onClick={() => createCategory()}>New Category</button>
            <button onClick={() => openQuizEditor(null)}>New Quiz</button>
            <select>
              <option>Name (A-Z)</option>
              <option>Name (Z-A)</option>
              <option>Date (Newest)</option>
              <option>Date (Oldest)</option>
            </select>
            <button onClick={goBack} disabled={categoryPath.length === 0}>Go back</button>
          </>
        )}
      </div>
      <div style={{ padding: "5px 15px", color: "white", fontSize: "12px", opacity: 0.7 }}>
        Current Path: /{categoryPath.join('/')}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", backgroundColor: "#282a35" }}>
        <GridList
          items={currentCategories}
          getId={(cat) => cat.Name}
          getTitle={(cat) => cat.Name}
          isSelected={(cat) => selectedNames.includes(cat.Name)}
          isConfirmed={(cat) => addedCategoryPaths.includes([...categoryPath, cat.Name].join('/'))}
          onItemClick={handleItemInteraction}
          onItemLongPress={handleLongPress}
          renderVisual={(category) =>
            category.ImageFile ? (
              <img
                className="thumbnail"
                src={
                  category.ImageFile.startsWith('file://') || category.ImageFile.startsWith('http')
                    ? Capacitor.convertFileSrc(category.ImageFile)
                    : Capacitor.convertFileSrc(`${externalBasePath}/${category.ImageFile.replace(/^\//, '')}`)
                }
                alt={category.Name}
              />
            ) : (
              <div className="placeholder-img">No Image</div>
            )
          }
        />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px", justifyContent: "center" }}>
        <button disabled={availableQuizzes.length === 0} onClick={startQuiz}>
          Start Quiz
        </button>
        <select
          value={quizPlayCount}
          onChange={(e) => setQuizPlayCount(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          disabled={availableQuizzes.length === 0}
        >
          {Array.from(
            { length: Math.floor(availableQuizzes.length / 5) },
            (_, i) => (i + 1) * 5
          ).map((count) => (
            <option key={count} value={count}>{count}</option>
          ))}
          <option value="all">All ({availableQuizzes.length})</option>
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: "5px", color: "white" }}>
          <input
            type="checkbox"
            checked={randomizeQuizzes}
            onChange={(e) => setRandomizeQuizzes(e.target.checked)}
          />
          Randomize
        </label>
        {isSelectionMode && (
          <button
            disabled={selectedNames.length === 0}
            onClick={isDeselectMode ? deselectQuizzesFromCategories : selectQuizzesFromCategories}
          >
            {isDeselectMode ? 'Deselect' : 'Select'}
          </button>
        )}
        <button disabled={addedCategoryPaths.length === 0} onClick={clearAllSelections}>
          Clear selection
        </button>
      </div>
      <div
        id="quizList"
        style={{ flex: "1", display: "flex", flexDirection: "column", border: "1px solid #ccc", minHeight: "100px" }}
      >
        <div style={{ padding: "5px 15px", color: "white", fontSize: "12px", opacity: 0.7 }}>
          {availableQuizzes.length > 0
            ? `Quizzes available (${selectedQuizNames.length} selected to play)`
            : "Select one or more categories, then press Select to load their quizzes here."}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", backgroundColor: "#282a35" }}>
          <GridList
            items={availableQuizzes}
            getId={quizKey}
            getTitle={(quiz) => quiz.quizName}
            onItemClick={openQuizEditor}
            renderVisual={(quiz) =>
              quiz.questionImage ? (
                <img
                  className="thumbnail"
                  src={
                    quiz.questionImage.startsWith('file://') || quiz.questionImage.startsWith('http')
                      ? Capacitor.convertFileSrc(quiz.questionImage)
                      : Capacitor.convertFileSrc(`${externalBasePath}/${quiz.questionImage.replace(/^\//, '')}`)
                  }
                  alt={quiz.quizName}
                />
              ) : (
                <div className="placeholder-img">No Image</div>
              )
            }
          />
        </div>
      </div>

    </div>
  );
}