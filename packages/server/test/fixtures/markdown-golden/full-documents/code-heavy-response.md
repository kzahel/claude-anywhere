Here are the changes across multiple files:

**src/utils/api.ts**

```typescript
export async function fetchData<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }
  return response.json();
}
```

**src/hooks/useQuery.ts**

```typescript
import { useState, useEffect } from "react";
import { fetchData } from "../utils/api";

export function useQuery<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchData<T>(url)
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, [url]);

  return { data, loading, error };
}
```

**src/components/UserList.tsx**

```typescript
import { useQuery } from "../hooks/useQuery";

interface User {
  id: number;
  name: string;
}

export function UserList() {
  const { data, loading, error } = useQuery<User[]>("/api/users");

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {data?.map((user) => (
        <li key={user.id}>{user.name}</li>
      ))}
    </ul>
  );
}
```