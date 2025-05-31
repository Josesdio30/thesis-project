// Short duration JWT token (5-10 min)
export function getTokenSession(name: string): string | null {
    if (typeof window !== "undefined") {
        return sessionStorage.getItem(name);
    }

    return null;
}

export function setTokenSession({ name, value }: { name: string; value: string }): void {
    if (typeof window !== "undefined") {
        sessionStorage.setItem(name, value);
    }
}

export function clearTokenSession(name: string[]): void {
    if (typeof window !== "undefined") {
        name.forEach((item) => sessionStorage.removeItem(item));
    }
}