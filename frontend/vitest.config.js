import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/components/**/*.test.jsx', 'tests/integration/**/*.test.js'],
    setupFiles: ['tests/setup.js'],
    coverage: {
      provider: 'v8',
      include: ['src/pages/ExpensesPage.jsx', 'src/pages/AuthPage.jsx',
        'src/components/ExpenseForm.jsx', 'src/components/RecentExpenses.jsx', 'src/services/api.js',
        'src/pages/PlanningPage.jsx', 'src/components/CsvImport.jsx', 'src/components/ExpenseFilters.jsx', 'src/utils/budget.js', 'src/components/SpendingInsights.jsx'],
      reporter: ['text', 'lcov', 'html'],
      thresholds: { lines: 85, statements: 85, branches: 75, functions: 85 },
    },
  },
});
