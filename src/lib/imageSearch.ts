import { imageSearch as ddgImageSearch } from '@mudbill/duckduckgo-images-api';

export interface ImageSearchResult {
    thumbnail: string;
    image: string;
    title: string;
    source: string;
}

export async function searchImages(query: string): Promise<ImageSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    const results = await ddgImageSearch({
        query: trimmed,
        safe: true,
        iterations: 1,
        retries: 1,
    });

    return (results ?? []).slice(0, 30).map((r: any) => ({
        thumbnail: r.thumbnail,
        image: r.image,
        title: r.title ?? '',
        source: r.source ?? '',
    }));
}