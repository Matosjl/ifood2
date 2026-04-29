with open('frontend/src/components/RestaurantePage.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

old_digital = '{activeTab === "cardapio" && <div className="h-full overflow-y-auto"><DigitalMenu items={menuItems} restaurantName={restaurantName} /></div>}'
new_digital = '{activeTab === "cardapio" && <div className="h-full overflow-y-auto"><DigitalMenu items={menuItems} restaurantName={restaurantName} restauranteId={id} isOwner={true} /></div>}'

content = content.replace(old_digital, new_digital)

with open('frontend/src/components/RestaurantePage.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('RestaurantePage.jsx DigitalMenu props updated')
