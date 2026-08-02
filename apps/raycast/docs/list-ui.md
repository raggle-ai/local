# Raycast List UI Reference

Reference documentation for Raycast List UI components and best practices.

## Source

[Official Raycast List UI Documentation](https://developers.raycast.com/api-reference/user-interface/list.md)

## Key Components

### List

Primary container for displaying items with built-in filtering and search capabilities.

**Key Props:**

- `isLoading`: Boolean to show loading state
- `searchBarPlaceholder`: Placeholder text for search
- `onSearchTextChange`: Handler for search text updates
- `navigationTitle`: Title shown in navigation
- `searchBarAccessory`: Additional controls (e.g., dropdown filters)
- `throttle`: Enables search throttling

### List.Item

Individual entries in the list with customizable content and actions.

**Key Props:**

- `title`: Main item title
- `subtitle`: Secondary text
- `icon`: Icon or emoji
- `accessories`: Array of accessories (text, icons)
- `actions`: ActionPanel for interactions
- `detail`: Detailed view content

### List.Section

Groups related List.Items with optional titles.

**Key Props:**

- `title`: Section title
- `subtitle`: Optional section subtitle

### List.Dropdown

Secondary filtering dimension for lists.

**Key Props:**

- `onChange`: Handler for dropdown changes
- `storeValue`: Persist selected value
- `tooltip`: Tooltip text

## Integration Patterns

### Basic List with Search

```typescript
function MyList() {
  const [searchText, setSearchText] = useState("");
  const [filteredItems, setFilteredItems] = useState(items);

  useEffect(() => {
    const filtered = items.filter(item =>
      item.name.toLowerCase().includes(searchText.toLowerCase())
    );
    setFilteredItems(filtered);
  }, [searchText]);

  return (
    <List
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search items"
      isLoading={isLoading}
    >
      {filteredItems.map(item => (
        <List.Item
          key={item.id}
          title={item.name}
          subtitle={item.description}
          icon={item.icon}
          accessories={[{ text: item.category }]}
        />
      ))}
    </List>
  );
}
```

### List with Form Navigation

```typescript
function ListWithForm() {
  return (
    <List>
      {items.map(item => (
        <List.Item
          key={item.id}
          title={item.name}
          actions={
            <ActionPanel>
              <Action.Push
                title="Configure"
                target={<ConfigForm item={item} />}
                icon={Icon.Gear}
              />
              <Action
                title="Execute"
                onAction={() => executeItem(item)}
                icon={Icon.Play}
              />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
```

### List with Dropdown Filter

```typescript
function FilterableList() {
  const [selectedCategory, setSelectedCategory] = useState("");

  return (
    <List
      searchBarAccessory={
        <List.Dropdown
          tooltip="Filter by Category"
          storeValue={true}
          onChange={setSelectedCategory}
        >
          <List.Dropdown.Item title="All" value="" />
          {categories.map(cat => (
            <List.Dropdown.Item
              key={cat.id}
              title={cat.name}
              value={cat.value}
            />
          ))}
        </List.Dropdown>
      }
    >
      {/* filtered items */}
    </List>
  );
}
```

## Best Practices

1. **Use built-in filtering**: Leverage List's native search capabilities
2. **Implement sections**: Group related items logically
3. **Provide meaningful accessories**: Show relevant metadata
4. **Use Action.Push for complex interactions**: Navigate to forms or detail views
5. **Handle loading states**: Show appropriate loading indicators
6. **Implement pagination**: For large datasets
7. **Use throttling**: For search performance
8. **Store filter values**: Persist user preferences with `storeValue`
9. **Keep empty states actionable**: Add refresh, create, and settings actions to `List.EmptyView` so users are not trapped when a remote source has no rows or a search returns no matches.
10. **Use stable unique item IDs**: If multiple records can point at the same local folder or remote repository, render list rows with a composite id/key such as `sourceId:worktree` while keeping user-facing state keyed by the stable domain identifier.

## Common Patterns

### Projects With Cached Remote Sources

For the `Projects` command, remote project sources such as Turso/libSQL should render from local cache first and refresh the remote source in the background:

```typescript
const cachedRows = readCachedProjectSourceRows(preferences);
const rows = cachedRows ?? (await readProjectSourceRows(preferences));

renderProjects(rows);

if (cachedRows) {
  void refreshProjectSourceInBackground();
}
```

Use separate flags for refreshing remote data and rescanning local folders. A background network refresh should not force expensive local clone indexing or subpath discovery unless the user explicitly requests a force refresh.
