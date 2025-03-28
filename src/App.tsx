import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import Papa from 'papaparse';

interface Category {
  number: string;
  name: string;
  ponderation: number;
  indices: {
    feb2024: number;
    nov2024: number;
    dec2024: number;
    jan2025: number;
    feb2025: number;
    monthly_var_percent: number;
    yearly_var_percent: number;
    trimester_var_percent: number;
  };
  subcategories: Category[];
  level: number;
}

function buildHierarchy(data: any[]): Category[] {
  const hierarchy: Category[] = [];
  const categoryMap = new Map<string, Category>();

  // First pass: create all category objects
  data.forEach(row => {
    if (!row.Numéro || row.Numéro == 0) return; // Skip total row

    // Dynamically map indices
    const indices = {
      n: parseFloat(row['Indice février 2025']) || 0, // N (current month)
      n_1: parseFloat(row['Indice janvier 2025']) || 0, // N-1 (previous month)
      n_12: parseFloat(row['Indice février 2024']) || 0, // N-12 (same month last year)
      n_3: parseFloat(row['Indice novembre 2024']) || 0, // N-3 (three months ago)
      n_2: parseFloat(row['Indice décembre 2024']) || 0, // N-2 (two months ago)
    };

    const category: Category = {
      number: row.Numéro,
      name: row.Regroupement.replace(/^__\s+/, ''), // Remove leading underscores
      ponderation: parseFloat(row.Pondération) || 0,
      indices: {
        feb2024: indices.n_12,
        nov2024: indices.n_3,
        dec2024: indices.n_2,
        jan2025: indices.n_1,
        feb2025: indices.n,
        monthly_var_percent: 0, // Placeholder, calculated below
        yearly_var_percent: 0,  // Placeholder, calculated below
        trimester_var_percent: 0, // Placeholder, calculated below
      },
      subcategories: [],
      level: row.Regroupement.startsWith('__') ? 1 : 0
    };

    // Calculate var ann % = (N - N-12) / N-12
    if (indices.n_12 !== 0) {
      category.indices.yearly_var_percent = ((indices.n - indices.n_12) / indices.n_12) * 100;
    }

    // Calculate var men % = (N - N-1) / N-1
    if (indices.n_1 !== 0) {
      category.indices.monthly_var_percent = ((indices.n - indices.n_1) / indices.n_1) * 100;
    }

    // Calculate var trim % = (N - N-3) / N-3
    if (indices.n_3 !== 0) {
      category.indices.trimester_var_percent = ((indices.n - indices.n_3) / indices.n_3) * 100;
    }

    categoryMap.set(category.number, category);
  });

  // Create a root category "index0"
  const rootCategory: Category = {
    number: 'index0',
    name: 'Root Category',
    ponderation: 0, // Will be updated as the sum of all subcategories
    indices: {
      feb2024: 0,
      nov2024: 0,
      dec2024: 0,
      jan2025: 0,
      feb2025: 0,
      monthly_var_percent: 0,
      yearly_var_percent: 0,
      trimester_var_percent: 0,
    },
    subcategories: [],
    level: 0,
  };

  // Second pass: build hierarchy
  categoryMap.forEach(category => {
    const parentNumber = category.number.split('.').slice(0, -1).join('.');
    const parent = categoryMap.get(parentNumber);

    if (parent) {
      parent.subcategories.push(category);
    } else {
      // If no parent exists, add it to the root category
      rootCategory.subcategories.push(category);
    }
  });

  // Update the root category's ponderation as the sum of its subcategories
  rootCategory.ponderation = rootCategory.subcategories.reduce((sum, sub) => sum + sub.ponderation, 0);

  // Third pass: calculate indices as ponderated means
  const calculatePonderatedIndices = (category: Category) => {
  if (category.subcategories.length > 0) {
    const weightedSum = (key: keyof Category['indices']) =>
      category.subcategories.reduce(
        (sum, sub) => sub.indices[key] !== 0 ? sum + sub.indices[key] * sub.ponderation : sum,
        0
      );
    const validPonderation = (key: keyof Category['indices']) =>
      category.subcategories.reduce(
        (sum, sub) => sub.indices[key] !== 0 ? sum + sub.ponderation : sum,
        0
      );

    category.indices.feb2024 = validPonderation('feb2024') > 0 ? weightedSum('feb2024') / validPonderation('feb2024') : category.indices.feb2024;
    category.indices.nov2024 = validPonderation('nov2024') > 0 ? weightedSum('nov2024') / validPonderation('nov2024') : category.indices.nov2024;
    category.indices.dec2024 = validPonderation('dec2024') > 0 ? weightedSum('dec2024') / validPonderation('dec2024') : category.indices.dec2024;
    category.indices.jan2025 = validPonderation('jan2025') > 0 ? weightedSum('jan2025') / validPonderation('jan2025') : category.indices.jan2025;
    category.indices.feb2025 = validPonderation('feb2025') > 0 ? weightedSum('feb2025') / validPonderation('feb2025') : category.indices.feb2025;

    // Recalculate variation percentages
    if (category.indices.feb2024 !== 0) {
      category.indices.yearly_var_percent =
        ((category.indices.feb2025 - category.indices.feb2024) / category.indices.feb2024) * 100;
    }
    if (category.indices.jan2025 !== 0) {
      category.indices.monthly_var_percent =
        ((category.indices.feb2025 - category.indices.jan2025) / category.indices.jan2025) * 100;
    }
    if (category.indices.nov2024 !== 0) {
      category.indices.trimester_var_percent =
        ((category.indices.feb2025 - category.indices.nov2024) / category.indices.nov2024) * 100;
    }
  }

  // Recursively calculate for subcategories
  category.subcategories.forEach(calculatePonderatedIndices);
};

  calculatePonderatedIndices(rootCategory);

  // Add the root category to the hierarchy
  hierarchy.push(rootCategory);

  return hierarchy;
}

function CategoryRow({ 
  category, 
  onPonderationChange,
  onToggle,
  isExpanded
}: { 
  category: Category;
  onPonderationChange: (number: string, value: number) => void;
  onToggle: () => void;
  isExpanded: boolean;
}) {
  const hasSubcategories = category.subcategories.length > 0;
  const paddingLeft = `${category.level * 2 + 1}rem`;

  return (
    <div 
      className={`
        flex items-center p-2 hover:bg-gray-50 cursor-pointer
        ${category.level > 0 ? 'border-l border-gray-200' : ''}
      `}
      style={{ paddingLeft }}
      onClick={onToggle}
    >
      <div className="flex items-center w-full">
        <div className="w-6 flex-shrink-0">
          {hasSubcategories && (
            <div className="p-1 hover:bg-gray-200 rounded">
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </div>
          )}
        </div>
        
        <div className="flex-1 grid grid-cols-12 gap-4 items-center">
          <span className="text-left font-mono text-sm">{category.number}</span>
          <span className="text-left col-span-2 text-sm">{category.name}</span>
          <div onClick={e => e.stopPropagation()}>
            <input
              type="number"
              value={category.ponderation}
              onChange={(e) => onPonderationChange(category.number, parseFloat(e.target.value))}
              onBlur={() => console.log('clicked away')}
              className="w-24 px-2 py-1 border rounded text-right"
              step="1"
            />
          </div>
          <span className="text-right text-sm">{category.indices.feb2024.toFixed(1)}</span>
          <span className="text-right text-sm">{category.indices.nov2024.toFixed(1)}</span>
          <span className="text-right text-sm">{category.indices.dec2024.toFixed(1)}</span>
          <span className="text-right text-sm">{category.indices.jan2025.toFixed(1)}</span>
          <span className="text-right text-sm">{category.indices.feb2025.toFixed(1)}</span>
          <span className="text-right text-sm">{category.indices.monthly_var_percent.toFixed(1)}</span>
          <span className="text-right text-sm">{category.indices.trimester_var_percent.toFixed(1)}</span>
          <span className="text-right text-sm">{category.indices.yearly_var_percent.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('../Tableau_Données_Détaillées_2025-02.csv');
        const csvText = await response.text();

        // Parse the CSV data
        const parsedData = Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
        });

        if (parsedData.errors.length > 0) {
          console.error('Error parsing CSV:', parsedData.errors);
          return;
        }

        const hierarchicalData = buildHierarchy(parsedData.data);
        setCategories(hierarchicalData);
      } catch (error) {
        console.error('Error fetching or parsing the CSV file:', error);
      }
    }

    fetchData();
  }, []);

  const handlePonderationChange = (number: string, value: number) => {
    setCategories(prevCategories => {
      const updateCategory = (cats: Category[]): Category[] => {
        return cats.map(cat => {
          if (cat.number === number) {
            // Update the category's ponderation
            const totalChildrenPonderation = cat.subcategories.reduce((sum, sub) => sum + sub.ponderation, 0);
  
            if (totalChildrenPonderation > 0) {
              // Adjust children and their descendants to maintain proportions
              const scaleFactor = value / totalChildrenPonderation;
              const updateSubcategories = (subcategories: Category[], scaleFactor: number): Category[] => {
                return subcategories.map(sub => ({
                  ...sub,
                  ponderation: sub.ponderation * scaleFactor,
                  subcategories: updateSubcategories(sub.subcategories, scaleFactor),
                }));
              };
  
              const updatedSubcategories = updateSubcategories(cat.subcategories, scaleFactor);
  
              // Recalculate indices as ponderated means of non-zero subcategories
              const weightedSum = (key: keyof Category['indices']) =>
                updatedSubcategories.reduce(
                  (sum, sub) => sub.indices[key] !== 0 ? sum + sub.indices[key] * sub.ponderation : sum,
                  0
                );
              const validPonderation = (key: keyof Category['indices']) =>
                updatedSubcategories.reduce(
                  (sum, sub) => sub.indices[key] !== 0 ? sum + sub.ponderation : sum,
                  0
                );
  
              return {
                ...cat,
                ponderation: value,
                subcategories: updatedSubcategories,
                indices: {
                  feb2024: validPonderation('feb2024') > 0 ? weightedSum('feb2024') / validPonderation('feb2024') : cat.indices.feb2024,
                  nov2024: validPonderation('nov2024') > 0 ? weightedSum('nov2024') / validPonderation('nov2024') : cat.indices.nov2024,
                  dec2024: validPonderation('dec2024') > 0 ? weightedSum('dec2024') / validPonderation('dec2024') : cat.indices.dec2024,
                  jan2025: validPonderation('jan2025') > 0 ? weightedSum('jan2025') / validPonderation('jan2025') : cat.indices.jan2025,
                  feb2025: validPonderation('feb2025') > 0 ? weightedSum('feb2025') / validPonderation('feb2025') : cat.indices.feb2025,
                  monthly_var_percent:
                    cat.indices.jan2025 !== 0
                      ? ((cat.indices.feb2025 - cat.indices.jan2025) / cat.indices.jan2025) * 100
                      : 0,
                  yearly_var_percent:
                    cat.indices.feb2024 !== 0
                      ? ((cat.indices.feb2025 - cat.indices.feb2024) / cat.indices.feb2024) * 100
                      : 0,
                  trimester_var_percent:
                    cat.indices.nov2024 !== 0
                      ? ((cat.indices.feb2025 - cat.indices.nov2024) / cat.indices.nov2024) * 100
                      : 0,
                },
              };
            }
  
            // No children, just update the ponderation
            return { ...cat, ponderation: value };
          }
  
          if (cat.subcategories.length > 0) {
            // Recursively update subcategories
            const updatedSubcategories = updateCategory(cat.subcategories);
  
            // Update the parent's ponderation to be the sum of its children
            const updatedPonderation = updatedSubcategories.reduce((sum, sub) => sum + sub.ponderation, 0);
  
            // Recalculate indices as ponderated means of non-zero subcategories
            const weightedSum = (key: keyof Category['indices']) =>
              updatedSubcategories.reduce(
                (sum, sub) => sub.indices[key] !== 0 ? sum + sub.indices[key] * sub.ponderation : sum,
                0
              );
            const validPonderation = (key: keyof Category['indices']) =>
              updatedSubcategories.reduce(
                (sum, sub) => sub.indices[key] !== 0 ? sum + sub.ponderation : sum,
                0
              );
  
            return {
              ...cat,
              ponderation: updatedPonderation,
              subcategories: updatedSubcategories,
              indices: {
                feb2024: validPonderation('feb2024') > 0 ? weightedSum('feb2024') / validPonderation('feb2024') : cat.indices.feb2024,
                nov2024: validPonderation('nov2024') > 0 ? weightedSum('nov2024') / validPonderation('nov2024') : cat.indices.nov2024,
                dec2024: validPonderation('dec2024') > 0 ? weightedSum('dec2024') / validPonderation('dec2024') : cat.indices.dec2024,
                jan2025: validPonderation('jan2025') > 0 ? weightedSum('jan2025') / validPonderation('jan2025') : cat.indices.jan2025,
                feb2025: validPonderation('feb2025') > 0 ? weightedSum('feb2025') / validPonderation('feb2025') : cat.indices.feb2025,
                monthly_var_percent:
                  cat.indices.jan2025 !== 0
                    ? ((cat.indices.feb2025 - cat.indices.jan2025) / cat.indices.jan2025) * 100
                    : 0,
                yearly_var_percent:
                  cat.indices.feb2024 !== 0
                    ? ((cat.indices.feb2025 - cat.indices.feb2024) / cat.indices.feb2024) * 100
                    : 0,
                trimester_var_percent:
                  cat.indices.nov2024 !== 0
                    ? ((cat.indices.feb2025 - cat.indices.nov2024) / cat.indices.nov2024) * 100
                    : 0,
              },
            };
          }
  
          return cat; // No changes
        });
      };
  
      return updateCategory(prevCategories);
    });
  };

  const toggleCategory = (number: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(number)) {
        next.delete(number);
      } else {
        next.add(number);
      }
      return next;
    });
  };

  const renderCategories = (categories: Category[]) => {
    return categories.map(category => (
      <React.Fragment key={category.number}>
        <CategoryRow
          category={category}
          onPonderationChange={handlePonderationChange}
          onToggle={() => toggleCategory(category.number)}
          isExpanded={expandedCategories.has(category.number)}
        />
        {expandedCategories.has(category.number) && category.subcategories.length > 0 && (
          <div className="border-l border-gray-200">
            {renderCategories(category.subcategories)}
          </div>
        )}
      </React.Fragment>
    ));
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-12xl mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-6">Catégories et Pondérations</h1>

          {/* Display the total ponderation */}
          

          <div className="grid grid-cols-12 gap-4 px-10 py-3 bg-gray-50 font-semibold text-sm">
            <span className="text-left w-16">Code</span>
            <span className="text-left col-span-2 w-32">Catégorie</span>
            <span className="text-left w-24">Pondération</span>
            <span className="text-right text-sm">Fév 2024</span>
            <span className="text-right text-sm">Nov 2024</span>
            <span className="text-right text-sm">Dec 2024</span>
            <span className="text-right text-sm">Jan 2025</span>
            <span className="text-right text-sm">Fév 2025</span>
            <span className="text-right text-sm">var men %</span>
            <span className="text-right text-sm">var trim %</span>
            <span className="text-right text-sm">var ann %</span>
          </div>

          <div className="divide-y">
            {renderCategories(categories)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;