"use client";

import type { Comment, FeedItem, Profile } from "./types";

/** Alles Soziale spricht denselben Endpunktstil: JSON rein, JSON raus. */

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
    cache: "no-store",
  });
  if (!response.ok) {
    const message = await response
      .json()
      .then((d: { error?: string }) => d.error)
      .catch(() => undefined);
    throw new Error(message ?? `Anfrage fehlgeschlagen (${response.status})`);
  }
  return (await response.json()) as T;
}

export type FeedScope = "following" | "discover";

export function fetchFeed(scope: FeedScope, before?: number | null): Promise<{ items: FeedItem[] }> {
  const params = new URLSearchParams({ scope });
  if (before) params.set("before", String(before));
  return request(`/api/feed?${params}`);
}

export function fetchProfile(
  handle: string,
  before?: number | null,
): Promise<{ profile: Profile; items: FeedItem[] }> {
  const params = new URLSearchParams();
  if (before) params.set("before", String(before));
  return request(`/api/profiles/${encodeURIComponent(handle)}?${params}`);
}

export function fetchOwnProfile(): Promise<{ profile: Profile }> {
  return request("/api/profile");
}

export function saveProfile(fields: {
  handle?: string;
  displayName?: string;
  bio?: string;
}): Promise<{ profile: Profile }> {
  return request("/api/profile", { method: "PATCH", body: JSON.stringify(fields) });
}

export function setFollow(handle: string, follow: boolean): Promise<{ profile: Profile }> {
  return request(`/api/profiles/${encodeURIComponent(handle)}/follow`, {
    method: follow ? "POST" : "DELETE",
  });
}

export function setLike(entryId: string, liked: boolean): Promise<{ likeCount: number; liked: boolean }> {
  return request(`/api/entries/${encodeURIComponent(entryId)}/like`, {
    method: liked ? "POST" : "DELETE",
  });
}

export function fetchComments(entryId: string): Promise<{ comments: Comment[] }> {
  return request(`/api/entries/${encodeURIComponent(entryId)}/comments`);
}

export function postComment(entryId: string, body: string): Promise<{ comment: Comment }> {
  return request(`/api/entries/${encodeURIComponent(entryId)}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

export function deleteComment(id: string): Promise<{ deleted: boolean }> {
  return request(`/api/comments/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function fetchPeople(query?: string): Promise<{ profiles: Profile[]; suggested: boolean }> {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  return request(`/api/people?${params}`);
}
