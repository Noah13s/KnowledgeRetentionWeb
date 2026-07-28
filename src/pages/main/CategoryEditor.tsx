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
import type { Quiz } from './types';
import type { Category } from './types';

interface LoadedJsonFile {
  path: string;
  data: any;
}

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cat_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function normalizeText(value: string) {
  return (value ?? '').trim();
}

function normalizeCategoryPath(value: string) {
  return (value ?? '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('/');
}

function sameCategoryName(a: string, b: string) {
  return normalizeText(a).toLowerCase() === normalizeText(b).toLowerCase();
}

function isObject(value: any): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function collectCategoryIds(category: Category): string[] {
  return [
    category.id,
    ...(category.subCategories ?? []).flatMap(collectCategoryIds),
  ];
}

function sanitizeCategoryTree(list: any[]): Category[] {
  return (Array.isArray(list) ? list : []).map((cat) => ({
    id: typeof cat?.id === 'string' && cat.id.trim() ? cat.id : makeId(),
    Name: normalizeText(cat?.Name ?? ''),
    Description: typeof cat?.Description === 'string' ? cat.Description : '',
    ImageFile: typeof cat?.ImageFile === 'string' ? cat.ImageFile : '',
    quizFiles: Array.isArray(cat?.quizFiles) ? cat.quizFiles : [],
    subCategories: sanitizeCategoryTree(cat?.subCategories ?? []),
  }));
}

function findCategoryById(categories: Category[], id: string): Category | null {
  for (const cat of categories) {
    if (cat.id === id) return cat;
    const found = findCategoryById(cat.subCategories ?? [], id);
    if (found) return found;
  }
  return null;
}

function getCategoryPathById(categories: Category[], id: string, currentPath: string[] = []): string | null {
  for (const cat of categories) {
    const nextPath = [...currentPath, cat.Name];
    if (cat.id === id) {
      return normalizeCategoryPath(nextPath.join('/'));
    }
    const found = getCategoryPathById(cat.subCategories ?? [], id, nextPath);
    if (found) return found;
  }
  return null;
}

function findCategoryByPath(categories: Category[], path: string): Category | null {
  const segments = normalizeCategoryPath(path)
    .split('/')
    .filter(Boolean);

  let currentList = categories;
  let current: Category | null = null;

  for (const segment of segments) {
    current = currentList.find((cat) => sameCategoryName(cat.Name, segment)) ?? null;
    if (!current) return null;
    currentList = current.subCategories ?? [];
  }

  return current;
}

function resolveCategoryIdFromPath(categories: Category[], path: string): string | null {
  return findCategoryByPath(categories, path)?.id ?? null;
}

function getQuizCategoryId(quiz: Quiz, categories: Category[]): string | null {
  if (quiz.categoryId) return quiz.categoryId;
  if (quiz.category) return resolveCategoryIdFromPath(categories, quiz.category);
  return null;
}

function migrateQuizObject<T>(data: T, categories: Category[]): T {
  if (!isObject(data)) return data;

  const quiz = data as any;
  const resolvedById =
    typeof quiz.categoryId === 'string' && quiz.categoryId
      ? getCategoryPathById(categories, quiz.categoryId)
      : null;
  const resolvedByPath =
    typeof quiz.category === 'string' && quiz.category
      ? resolveCategoryIdFromPath(categories, quiz.category)
      : null;

  const finalCategoryId =
    (typeof quiz.categoryId === 'string' && quiz.categoryId) ||
    resolvedByPath ||
    null;

  const finalCategoryPath =
    normalizeCategoryPath(
      quiz.category ??
      resolvedById ??
      ''
    ) || '';

  return {
    ...quiz,
    categoryId: finalCategoryId,
    category: finalCategoryPath,
  };
}

function migrateQuizPayload(data: any, categories: Category[]) {
  if (Array.isArray(data)) {
    return data.map((item) => migrateQuizObject(item, categories));
  }
  return migrateQuizObject(data, categories);
}

function extractQuizzes(data: any): Quiz[] {
  if (Array.isArray(data)) {
    return data.filter(isObject) as Quiz[];
  }
  if (isObject(data)) {
    return [data as Quiz];
  }
  return [];
}

async function loadJsonFilesRecursively(
  path: string,
  directory: Directory
): Promise<LoadedJsonFile[]> {
  const entries = await Filesystem.readdir({ path, directory });
  const results: LoadedJsonFile[] = [];

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

      try {
        results.push({
          path: childPath,
          data: JSON.parse(file.data as string),
        });
      } catch (err) {
        console.warn(`Skipping invalid JSON file: ${childPath}`, err);
      }
    }
  }

  return results;
}

function collectDescendantIdsFromSelected(categories: Category[], selectedIds: string[]) {
  const result = new Set<string>();

  for (const id of selectedIds) {
    const category = findCategoryById(categories, id);
    if (!category) continue;

    for (const descendantId of collectCategoryIds(category)) {
      result.add(descendantId);
    }
  }

  return Array.from(result);
}

function updateCategoryNameById(
  list: Category[],
  targetId: string,
  newName: string
): Category[] {
  return list.map((cat) => {
    if (cat.id === targetId) {
      return { ...cat, Name: newName };
    }
    return {
      ...cat,
      subCategories: updateCategoryNameById(cat.subCategories ?? [], targetId, newName),
    };
  });
}

function removeCategoriesByIds(list: Category[], idsToRemove: Set<string>): Category[] {
  return list
    .filter((cat) => !idsToRemove.has(cat.id))
    .map((cat) => ({
      ...cat,
      subCategories: removeCategoriesByIds(cat.subCategories ?? [], idsToRemove),
    }));
}

export default function CategoryPage() {
  const [externalBasePath, setExternalBasePath] = usePersistentState<string>('categoryEditor.externalBasePath', '');
  const [categories, setCategories] = usePersistentState<Category[]>('categoryEditor.categories', []);
  const [quizzes, setQuizzes] = usePersistentState<Quiz[]>('categoryEditor.quizzes', []);
  const [availableQuizzes, setAvailableQuizzes] = usePersistentState<Quiz[]>('categoryEditor.availableQuizzes', []);
  const [selectedCategoryIds, setSelectedCategoryIds] = usePersistentState<string[]>('categoryEditor.selectedCategoryIds', []);
  const [isSelectionMode, setIsSelectionMode] = usePersistentState<boolean>('categoryEditor.isSelectionMode', false);
  const [categoryPath, setCategoryPath] = usePersistentState<string[]>('categoryEditor.categoryPath', []);
  const [addedCategoryIds, setAddedCategoryIds] = usePersistentState<string[]>('categoryEditor.addedCategoryIds', []);
  const [isPickingImage, setIsPickingImage] = usePersistentState<boolean>('categoryEditor.isPickingImage', false);
  const [hasLoaded, setHasLoaded] = usePersistentState<boolean>('categoryEditor.hasLoaded', false);
  const [isEditingQuiz, setIsEditingQuiz] = usePersistentState<boolean>('categoryEditor.isEditingQuiz', false);
  const [editingQuiz, setEditingQuiz] = usePersistentState<Quiz | null>('categoryEditor.editingQuiz', null);
  const [isPlayingQuiz, setIsPlayingQuiz] = usePersistentState<boolean>('categoryEditor.isPlayingQuiz', false);
  const [quizPlayCount, setQuizPlayCount] = usePersistentState<number | 'all'>('categoryEditor.quizPlayCount', 5);
  const [randomizeQuizzes, setRandomizeQuizzes] = usePersistentState<boolean>('categoryEditor.randomizeQuizzes', false);
  const [quizzesForPlayer, setQuizzesForPlayer] = usePersistentState<Quiz[]>('categoryEditor.quizzesForPlayer', []);

  useEffect(() => {
    if (hasLoaded) return;

    const run = async () => {
      try {
        const uriResult = await Filesystem.getUri({
          path: '',
          directory: Directory.External,
        });
        setExternalBasePath(uriResult.uri);
      } catch (e) {
        console.error('Failed to get external base path', e);
      }

      let migratedCategories: Category[] = [];

      try {
        const categoriesFile = await Filesystem.readFile({
          path: 'categories.json',
          directory: Directory.External,
          encoding: Encoding.UTF8,
        });

        const parsedCategories = JSON.parse(categoriesFile.data as string);
        migratedCategories = sanitizeCategoryTree(parsedCategories.categories ?? []);
        setCategories(migratedCategories);

        await Filesystem.writeFile({
          path: 'categories.json',
          directory: Directory.External,
          encoding: Encoding.UTF8,
          data: JSON.stringify({ categories: migratedCategories }, null, 2),
        });
      } catch (err: any) {
        console.warn('categories.json not found, starting empty:', err);
        migratedCategories = [];
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
        const quizFiles = await loadJsonFilesRecursively('quizzes', Directory.External);

        const migratedFiles = quizFiles.map((file) => ({
          ...file,
          data: migrateQuizPayload(file.data, migratedCategories),
        }));

        for (let i = 0; i < migratedFiles.length; i += 1) {
          const original = quizFiles[i];
          const migrated = migratedFiles[i];

          if (JSON.stringify(original.data) !== JSON.stringify(migrated.data)) {
            await Filesystem.writeFile({
              path: migrated.path,
              directory: Directory.External,
              encoding: Encoding.UTF8,
              data: JSON.stringify(migrated.data, null, 2),
              recursive: true,
            });
          }
        }

        setQuizzes(
          migratedFiles.flatMap((file) => extractQuizzes(file.data))
        );

        setAvailableQuizzes((prev) =>
          prev.map((quiz) => migrateQuizObject(quiz, migratedCategories))
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
  }, [hasLoaded, setAvailableQuizzes, setCategories, setExternalBasePath, setHasLoaded, setQuizzes]);

  useEffect(() => {
    setSelectedCategoryIds([]);
    setIsSelectionMode(false);
  }, [categoryPath, setIsSelectionMode, setSelectedCategoryIds]);

  const currentCategories = (() => {
    let currentList = categories;
    for (const segment of categoryPath) {
      const found = currentList.find((cat) => sameCategoryName(cat.Name, segment));
      if (found) {
        currentList = found.subCategories ?? [];
      } else {
        break;
      }
    }
    return currentList;
  })();

  const openCategory = (category: Category) => {
    setCategoryPath((prev) => [...prev, category.Name]);
  };

  const goBack = useCallback(() => {
    setCategoryPath((prev) => prev.slice(0, -1));
    setIsSelectionMode(false);
    setSelectedCategoryIds([]);
  }, [setCategoryPath, setIsSelectionMode, setSelectedCategoryIds]);

  useEffect(() => {
    if (categoryPath.length === 0 || isPickingImage || isEditingQuiz || isPlayingQuiz) return;

    const listenerPromise = CapacitorApp.addListener('backButton', goBack);
    return () => {
      listenerPromise.then((listener) => listener.remove());
    };
  }, [categoryPath, goBack, isPickingImage, isEditingQuiz, isPlayingQuiz]);

  const handleItemInteraction = (category: Category) => {
    if (isSelectionMode) {
      setSelectedCategoryIds((prev) =>
        prev.includes(category.id)
          ? prev.filter((id) => id !== category.id)
          : [...prev, category.id]
      );
    } else {
      openCategory(category);
    }
  };

  async function createCategory() {
    const categoryName = window.prompt('Enter a new name:');
    if (!categoryName) return;

    const cleanName = categoryName.trim();
    if (!cleanName) return;

    if (currentCategories.some((cat) => sameCategoryName(cat.Name, cleanName))) {
      alert('A category with this name already exists in this folder.');
      return;
    }

    const newCategory: Category = {
      id: makeId(),
      Name: cleanName,
      Description: '',
      ImageFile: '',
      quizFiles: [],
      subCategories: [],
    };

    const updateTree = (list: Category[], pathIndex: number): Category[] => {
      if (pathIndex >= categoryPath.length) {
        return [...list, newCategory];
      }

      const targetName = categoryPath[pathIndex];
      return list.map((cat) => {
        if (sameCategoryName(cat.Name, targetName)) {
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
      console.log('Successfully created and saved new category:', newCategory.Name);
    } catch (err) {
      console.error('Failed to write updated categories structure to disk:', err);
      alert('Could not save new category to device storage.');
    }
  }

  const handleLongPress = (category: Category) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
      setSelectedCategoryIds([category.id]);
    }
  };

  function cancelSelection() {
    setIsSelectionMode(false);
    setSelectedCategoryIds([]);
  }

  async function deleteCategories() {
    if (selectedCategoryIds.length === 0) return;

    const confirmDelete = window.confirm(`Are you sure you want to delete the ${selectedCategoryIds.length} selected item(s)?`);
    if (!confirmDelete) return;

    const updatedCategories = removeCategoriesByIds(categories, new Set(selectedCategoryIds));
    setCategories(updatedCategories);
    cancelSelection();

    try {
      await Filesystem.writeFile({
        path: 'categories.json',
        directory: Directory.External,
        encoding: Encoding.UTF8,
        data: JSON.stringify({ categories: updatedCategories }, null, 2),
      });
      console.log('Deleted successfully.');
    } catch (err) {
      console.error('Failed to save changes after deletion:', err);
      alert('Could not save changes to storage.');
    }
  }

  async function renameCategory() {
    if (selectedCategoryIds.length !== 1) return;

    const selectedId = selectedCategoryIds[0];
    const selectedCategory = findCategoryById(categories, selectedId);
    if (!selectedCategory) return;

    const oldName = selectedCategory.Name;
    const newName = window.prompt('Enter a new name for this category:', oldName);

    if (!newName) return;

    const cleanNewName = normalizeText(newName);

    if (!cleanNewName || cleanNewName === oldName) {
      return;
    }

    const parentPath =
      getCategoryPathById(categories, selectedId)
        ?.split('/')
        .slice(0, -1)
        .join('/') ?? '';

    const siblings = parentPath
      ? findCategoryByPath(categories, parentPath)?.subCategories ?? []
      : categories;

    const duplicate = siblings.some(
      (cat) =>
        cat.id !== selectedId &&
        sameCategoryName(cat.Name, cleanNewName)
    );

    if (duplicate) {
      alert('A category with this name already exists in this folder.');
      return;
    }

    const updatedCategories = updateCategoryNameById(
      categories,
      selectedId,
      cleanNewName
    );

    setCategories(updatedCategories);

    // No quiz update needed.
    // Quizzes are linked using categoryId.

    try {
      await Filesystem.writeFile({
        path: 'categories.json',
        directory: Directory.External,
        encoding: Encoding.UTF8,
        data: JSON.stringify(
          { categories: updatedCategories },
          null,
          2
        ),
      });

      console.log('Category renamed successfully.');
    } catch (err) {
      console.error('Failed to save renamed category:', err);
      alert('Could not save category changes.');
    }

    cancelSelection();
  }

  function shuffleArray<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
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
    if (selectedCategoryIds.length === 0) return;

    const selectedWithChildren = collectDescendantIdsFromSelected(categories, selectedCategoryIds);

    const matched = quizzes.filter((quiz) => {
      const quizCategoryId = getQuizCategoryId(quiz, categories);
      return quizCategoryId ? selectedWithChildren.includes(quizCategoryId) : false;
    });

    setAvailableQuizzes((prev) => {
      const merged = [...prev, ...matched];
      const seen = new Set<string>();
      return merged.filter((q) => {
        const key = quizKey(q, categories);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });

    setAddedCategoryIds((prev) => Array.from(new Set([...prev, ...selectedWithChildren])));
    cancelSelection();
  }

  function deselectQuizzesFromCategories() {
    if (selectedCategoryIds.length === 0) return;

    const selectedWithChildren = collectDescendantIdsFromSelected(categories, selectedCategoryIds);

    const belongsToSelection = (quiz: Quiz) => {
      const quizCategoryId = getQuizCategoryId(quiz, categories);
      return quizCategoryId ? selectedWithChildren.includes(quizCategoryId) : false;
    };

    setAvailableQuizzes((prev) => prev.filter((q) => !belongsToSelection(q)));
    setAddedCategoryIds((prev) => prev.filter((id) => !selectedWithChildren.includes(id)));
    cancelSelection();
  }

  function clearAllSelections() {
    setAvailableQuizzes([]);
    setAddedCategoryIds([]);
  }

  function quizKey(quiz: Quiz, currentCategories: Category[]) {
    const categoryId = getQuizCategoryId(quiz, currentCategories);
    const categoryPart = categoryId ?? normalizeCategoryPath(quiz.category ?? '');
    return `${categoryPart}::${quiz.quizName}`;
  }

  const isDeselectMode =
    selectedCategoryIds.length > 0 &&
    selectedCategoryIds.every((id) => addedCategoryIds.includes(id));

  async function handleImagePicked(imagePath: string) {
    setIsPickingImage(false);
    if (selectedCategoryIds.length !== 1) return;

    const targetId = selectedCategoryIds[0];

    const updateTree = (list: Category[]): Category[] =>
      list.map((cat) => {
        if (cat.id === targetId) {
          return { ...cat, ImageFile: imagePath };
        }
        return {
          ...cat,
          subCategories: updateTree(cat.subCategories ?? []),
        };
      });

    const updatedCategories = updateTree(categories);
    setCategories(updatedCategories);
    cancelSelection();

    try {
      await Filesystem.writeFile({
        path: 'categories.json',
        directory: Directory.External,
        encoding: Encoding.UTF8,
        data: JSON.stringify({ categories: updatedCategories }, null, 2),
      });
      console.log('Image set successfully.');
    } catch (err) {
      console.error('Failed to save changes after setting image:', err);
      alert('Could not save changes to storage.');
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
      const resolvedCategoryId =
        quiz.categoryId ??
        resolveCategoryIdFromPath(categories, quiz.category ?? '') ??
        originalQuiz?.categoryId ??
        null;

      const resolvedCategoryPath =
        normalizeCategoryPath(
          quiz.category ??
          (resolvedCategoryId ? getCategoryPathById(categories, resolvedCategoryId) ?? '' : '')
        ) || normalizeCategoryPath(categoryPath.join('/'));

      const quizToSave: Quiz = {
        ...quiz,
        categoryId: resolvedCategoryId ?? undefined,
        category: resolvedCategoryPath,
      };

      const fileName = `quizzes/${resolvedCategoryPath}/${quizToSave.quizName}.json`.replace(/\/+/g, '/');

      await Filesystem.writeFile({
        path: fileName,
        directory: Directory.External,
        encoding: Encoding.UTF8,
        data: JSON.stringify(quizToSave, null, 2),
        recursive: true,
      });

      if (
        originalQuiz &&
        (
          originalQuiz.quizName !== quizToSave.quizName ||
          normalizeCategoryPath(originalQuiz.category ?? '') !== resolvedCategoryPath ||
          originalQuiz.categoryId !== quizToSave.categoryId
        )
      ) {
        const originalResolvedCategoryPath =
          normalizeCategoryPath(
            originalQuiz.category ??
            (originalQuiz.categoryId
              ? getCategoryPathById(categories, originalQuiz.categoryId) ?? ''
              : '')
          ) || '';

        const oldFileName = `quizzes/${originalResolvedCategoryPath}/${originalQuiz.quizName}.json`.replace(/\/+/g, '/');
        try {
          await Filesystem.deleteFile({ path: oldFileName, directory: Directory.External });
        } catch (e) {
          console.warn('Old quiz file not found, nothing to clean up:', e);
        }
      }

      const replaceInList = (list: Quiz[]) => {
        const withoutOld = originalQuiz
          ? list.filter((q) => quizKey(q, categories) !== quizKey(originalQuiz, categories))
          : list;

        return [...withoutOld, quizToSave];
      };

      setQuizzes((prev) => replaceInList(prev));
      setAvailableQuizzes((prev) => replaceInList(prev));

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
      const categoryPathForFile =
        normalizeCategoryPath(
          quiz.category ??
          (quiz.categoryId ? getCategoryPathById(categories, quiz.categoryId) ?? '' : '')
        ) || normalizeCategoryPath(categoryPath.join('/'));

      const fileName = `quizzes/${categoryPathForFile}/${quiz.quizName}.json`.replace(/\/+/g, '/');
      await Filesystem.deleteFile({ path: fileName, directory: Directory.External });
    } catch (e) {
      console.warn('Quiz file not found, nothing to delete on disk:', e);
    }

    setQuizzes((prev) => prev.filter((q) => quizKey(q, categories) !== quizKey(quiz, categories)));
    setAvailableQuizzes((prev) => prev.filter((q) => quizKey(q, categories) !== quizKey(quiz, categories)));
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
        defaultCategory={
          editingQuiz
            ? normalizeCategoryPath(
              editingQuiz.category ??
              (editingQuiz.categoryId
                ? getCategoryPathById(categories, editingQuiz.categoryId) ?? ''
                : categoryPath.join('/'))
            )
            : normalizeCategoryPath(categoryPath.join('/'))
        }
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '5px', padding: '10px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', justifyContent: 'center' }}>
        {isSelectionMode ? (
          <>
            <button style={{ backgroundColor: '#e74c3c', color: 'white' }} onClick={cancelSelection}>
              Cancel Selection
            </button>
            <button disabled={selectedCategoryIds.length === 0} onClick={deleteCategories}>
              Delete
            </button>
            <button disabled={selectedCategoryIds.length !== 1} onClick={renameCategory}>
              Rename
            </button>
            <button disabled={selectedCategoryIds.length !== 1} onClick={() => setIsPickingImage(true)}>
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
            <button onClick={goBack} disabled={categoryPath.length === 0}>
              Go back
            </button>
          </>
        )}
      </div>

      <div style={{ padding: '5px 15px', color: 'white', fontSize: '12px', opacity: 0.7 }}>
        Current Path: /{categoryPath.join('/')}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', backgroundColor: '#282a35' }}>
        <GridList
          items={currentCategories}
          getId={(cat) => cat.id}
          getTitle={(cat) => cat.Name}
          isSelected={(cat) => selectedCategoryIds.includes(cat.id)}
          isConfirmed={(cat) => addedCategoryIds.includes(cat.id)}
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

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', justifyContent: 'center' }}>
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
            <option key={count} value={count}>
              {count}
            </option>
          ))}
          <option value="all">All ({availableQuizzes.length})</option>
        </select>

        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'white' }}>
          <input
            type="checkbox"
            checked={randomizeQuizzes}
            onChange={(e) => setRandomizeQuizzes(e.target.checked)}
          />
          Randomize
        </label>

        {isSelectionMode && (
          <button
            disabled={selectedCategoryIds.length === 0}
            onClick={isDeselectMode ? deselectQuizzesFromCategories : selectQuizzesFromCategories}
          >
            {isDeselectMode ? 'Deselect' : 'Select'}
          </button>
        )}

        <button disabled={addedCategoryIds.length === 0} onClick={clearAllSelections}>
          Clear selection
        </button>
      </div>

      <div
        id="quizList"
        style={{ flex: '1', display: 'flex', flexDirection: 'column', border: '1px solid #ccc', minHeight: '100px' }}
      >
        <div style={{ padding: '5px 15px', color: 'white', fontSize: '12px', opacity: 0.7 }}>
          {availableQuizzes.length > 0
            ? `Quizzes available (${availableQuizzes.length})`
            : 'Select one or more categories, then press Select to load their quizzes here.'}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', backgroundColor: '#282a35' }}>
          <GridList
            items={availableQuizzes}
            getId={(quiz) => quizKey(quiz, categories)}
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