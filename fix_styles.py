import os

files = [
    r'src\components\DishDetailModal.vue',
    r'src\views\SettingsView.vue',
    r'src\views\DishesView.vue',
    r'src\views\ShoppingView.vue',
    r'src\views\PlanView.vue',
    r'src\components\ProductDetailModal.vue',
    r'src\components\DishSelector.vue',
    r'src\App.vue',
    r'src\views\AuthView.vue',
    r'src\components\DishFilterModal.vue',
    r'src\components\DishProgress.vue'
]

base_dir = r'c:\Users\Никита\OneDrive\Desktop\my-projects\smart-meal-planner'

for file_rel in files:
    file_path = os.path.join(base_dir, file_rel)
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        continue
        
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        new_content = content.replace(' uppercase', '') \
                             .replace('uppercase ', '') \
                             .replace('uppercase', '') \
                             .replace(' lowercase', '') \
                             .replace('lowercase ', '') \
                             .replace('lowercase', '') \
                             .replace(' tracking-widest', '') \
                             .replace('tracking-widest ', '') \
                             .replace('tracking-widest', '') \
                             .replace(' tracking-wider', '') \
                             .replace('tracking-wider ', '') \
                             .replace('tracking-wider', '') \
                             .replace(' tracking-wide', '') \
                             .replace('tracking-wide ', '') \
                             .replace('tracking-wide', '')

        if content != new_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated: {file_rel}")
        else:
            print(f"No changes: {file_rel}")
            
    except Exception as e:
        print(f"Error processing {file_rel}: {e}")
