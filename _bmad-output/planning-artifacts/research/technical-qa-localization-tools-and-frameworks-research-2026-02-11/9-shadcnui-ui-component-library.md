# 9. shadcn/ui - UI Component Library

### Current Status

| Attribute | Detail |
|-----------|--------|
| **Type** | Copy-paste component collection (not npm package) |
| **Base** | Built on Radix UI primitives + Tailwind CSS |
| **CLI** | `npx shadcn@latest init` / `npx shadcn@latest add` |
| **License** | MIT |
| **Official Site** | https://ui.shadcn.com |

### Component Availability

| Component | Available | Relevance to QA Tool |
|-----------|-----------|---------------------|
| Data Table | Yes (built on TanStack Table) | Critical - QA results display |
| Dialog/Modal | Yes | Issue detail view |
| Form | Yes (React Hook Form + Zod) | File upload, settings |
| Tabs | Yes | Score breakdown tabs |
| Badge | Yes | Severity indicators |
| Progress | Yes | QA progress bar |
| Card | Yes | Dashboard cards |
| Select/Combobox | Yes | Language pair selection |
| Toast | Yes | Notifications |
| Dropdown Menu | Yes | Actions menu |
| Sheet (Side Panel) | Yes | Issue detail panel |
| Charts | Yes (added 2024) | Quality score visualization |
| Skeleton | Yes | Loading states |
| Pagination | Yes | Paginated results |
| Command | Yes | Command palette search |
| Alert | Yes | Warning/error messages |
| Accordion | Yes | Expandable issue details |
| Tooltip | Yes | Help text |

### Pros for QA Localization Tool

- **Data Table component** is excellent - built on TanStack Table v8 with sorting, filtering, pagination, column visibility, and row selection out of the box
- **Full ownership** of code - components are copied into your project, fully customizable
- **Consistent design** system with proper dark mode support
- **Accessible** - built on Radix UI which handles ARIA attributes automatically
- **Chart components** added - useful for quality score visualization
- **Theming** via CSS variables - easy to customize branding
- **TypeScript-first** with full type safety

### Cons

- Not a versioned package - no automatic updates (you manage the code)
- Requires Tailwind CSS (not a con for this project since we're using it)
- Some complex components (like a full spreadsheet view) need additional work
- Data Table requires understanding TanStack Table API for advanced customization

### Recommendation: Use shadcn/ui

Excellent choice for this project. The Data Table component is particularly well-suited for displaying QA results with filtering by severity, sorting, and pagination. The component library covers all UI needs for the MVP.

### Sources
- https://ui.shadcn.com/docs
- https://ui.shadcn.com/docs/components/data-table
- https://ui.shadcn.com/charts

---
