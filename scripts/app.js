const NEO4J_URI = "bolt://3.222.117.128"; 
const NEO4J_USER = "neo4j";                                  
const NEO4J_PASSWORD = "advance-prerequisite-armors";      


const userSelector = document.getElementById('user-selector');
const userPurchasesContainer = document.getElementById('user-purchases-container');
const recommendationsContainer = document.getElementById('recommendations-container');
const loadingIndicator = document.getElementById('loading');
const modal = document.getElementById('product-details-modal');
const productDetails = document.getElementById('product-details');
const closeModal = document.querySelector('.close-modal');
const graphContainer = document.getElementById('graph-container');
const newUserBtn = document.getElementById('new-user-btn');
const newUserModal = document.getElementById('new-user-modal');
const closeUserModal = document.querySelector('.close-user-modal');
const newUserForm = document.getElementById('new-user-form');
const userCreationStatus = document.getElementById('user-creation-status');
const assignProductBtn = document.getElementById('assign-product-btn');
const assignProductModal = document.getElementById('assign-product-modal');
const closeAssignModal = document.querySelector('.close-assign-modal');
const assignProductForm = document.getElementById('assign-product-form');
const userSelect = document.getElementById('user-select');
const productSelect = document.getElementById('product-select');
const productAssignmentStatus = document.getElementById('product-assignment-status');

let driver = null;
let currentUser = null;

function safeGetNodeId(node) {
    if (typeof node.identity === 'number') {
        return node.identity;
    }
    
    if (node.identity && typeof node.identity.toInt === 'function') {
        return node.identity.toInt();
    }
    
    if (node.identity && node.identity.low !== undefined) {
        return node.identity.low;
    }
    
    if (node.properties && node.properties.id) {
        return 'id-' + node.properties.id;
    }
    
    return 'node-' + Math.random().toString(36).substr(2, 9);
}

document.addEventListener('DOMContentLoaded', async () => {
    initNeo4j();
    setupEventListeners();
    
    await loadExistingUsers();
    
    if (typeof d3 === 'undefined') {
        console.error('Error: D3.js no está cargado. La visualización del grafo no funcionará.');
        graphContainer.innerHTML = '<p>Error: No se pudo cargar D3.js. La visualización del grafo no está disponible.</p>';
    } else {
        console.log('D3.js cargado correctamente. Versión:', d3.version);
    }
});

// Inicializar conexión con Neo4j
function initNeo4j() {
    try {
        driver = neo4j.driver(
            NEO4J_URI,
            neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD),
            { disableLosslessIntegers: true }
        );
        console.log('Conexión a Neo4j inicializada');
        
        // Test de conexión
        const testSession = driver.session();
        testSession.run('MATCH (n) RETURN count(n) as count')
            .then(result => {
                console.log('Conexión exitosa a Neo4j. Nodos encontrados:', result.records[0].get('count'));
                testSession.close();
            })
            .catch(error => {
                console.error('Error al conectar con Neo4j:', error);
                testSession.close();
            });
    } catch (error) {
        console.error('Error al conectar con Neo4j:', error);
        alert('No se pudo conectar a la base de datos Neo4j. Verifica la configuración.');
    }
}

function setupEventListeners() {
    // Event listeners existentes
    userSelector.addEventListener('change', async (e) => {
        const userId = e.target.value;
        if (!userId) {
            resetView();
            return;
        }
        
        currentUser = userId;
        await loadUserPurchases(userId);
        await loadRecommendations(userId);
        
        visualizeGraph(driver, userId);
    });

    closeModal.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });
    
    setupUserEventListeners();
    setupProductAssignmentListeners();
}

function setupUserEventListeners() {
    newUserBtn.addEventListener('click', () => {
        newUserModal.style.display = 'block';
    });
    
    closeUserModal.addEventListener('click', () => {
        newUserModal.style.display = 'none';
        userCreationStatus.innerHTML = '';
        userCreationStatus.className = '';
        newUserForm.reset();
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === newUserModal) {
            newUserModal.style.display = 'none';
            userCreationStatus.innerHTML = '';
            userCreationStatus.className = '';
            newUserForm.reset();
        }
    });
    
    newUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const userId = document.getElementById('user-id').value.trim();
        const userName = document.getElementById('user-name').value.trim();
        
        if (!userId || !userName) {
            showUserCreationStatus('Por favor, completa todos los campos.', false);
            return;
        }
        
        await createNewUser(userId, userName);
    });
}

function setupProductAssignmentListeners() {
    // Mostrar modal de asignación
    assignProductBtn.addEventListener('click', async () => {
        assignProductModal.style.display = 'block';
        
        await loadUsersForSelect();
        await loadProductsForSelect();
    });
    
    closeAssignModal.addEventListener('click', () => {
        assignProductModal.style.display = 'none';
        productAssignmentStatus.innerHTML = '';
        productAssignmentStatus.className = '';
        assignProductForm.reset();
    });
    
    window.addEventListener('click', (e) => {
        if (e.target === assignProductModal) {
            assignProductModal.style.display = 'none';
            productAssignmentStatus.innerHTML = '';
            productAssignmentStatus.className = '';
            assignProductForm.reset();
        }
    });
    
    assignProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const userId = userSelect.value;
        const productId = productSelect.value;
        const frequency = parseInt(document.getElementById('purchase-frequency').value, 10);
        
        if (!userId || !productId || isNaN(frequency) || frequency < 1) {
            showProductAssignmentStatus('Por favor, completa todos los campos correctamente.', false);
            return;
        }
        
        await assignProductToUser(userId, productId, frequency);
    });
}

// Cargar usuarios existentes desde Neo4j
async function loadExistingUsers() {
    if (!driver) {
        console.error('No hay conexión a Neo4j');
        return;
    }
    
    try {
        const session = driver.session();
        const result = await session.run(`
            MATCH (u:User)
            RETURN u.id AS id, u.name AS name
            ORDER BY u.name
        `);
        
        // Limpiar selector manteniendo la opción por defecto
        const defaultOption = userSelector.options[0];
        userSelector.innerHTML = '';
        userSelector.appendChild(defaultOption);
        
        // Añadir usuarios
        result.records.forEach(record => {
            const option = document.createElement('option');
            option.value = record.get('id');
            option.textContent = record.get('name');
            userSelector.appendChild(option);
        });
        
        await session.close();
    } catch (error) {
        console.error('Error al cargar usuarios:', error);
    }
}

// Cargar usuarios para el selector de asignación
async function loadUsersForSelect() {
    if (!driver) {
        console.error('No hay conexión a Neo4j');
        return;
    }
    
    try {
        const session = driver.session();
        const result = await session.run(`
            MATCH (u:User)
            RETURN u.id AS id, u.name AS name
            ORDER BY u.name
        `);
        
        const defaultOption = userSelect.options[0];
        userSelect.innerHTML = '';
        userSelect.appendChild(defaultOption);
        

        result.records.forEach(record => {
            const option = document.createElement('option');
            option.value = record.get('id');
            option.textContent = record.get('name');
            userSelect.appendChild(option);
        });
        
        await session.close();
    } catch (error) {
        console.error('Error al cargar usuarios:', error);
        showProductAssignmentStatus('Error al cargar usuarios', false);
    }
}
async function loadProductsForSelect() {
    if (!driver) {
        console.error('No hay conexión a Neo4j');
        return;
    }
    
    try {
        const session = driver.session();
        const result = await session.run(`
            MATCH (p:Product)
            OPTIONAL MATCH (p)-[:BELONGS_TO]->(c:Category)
            RETURN p.id AS id, p.name AS name, p.price AS price, c.name AS category
            ORDER BY p.name
        `);
        
        const defaultOption = productSelect.options[0];
        productSelect.innerHTML = '';
        productSelect.appendChild(defaultOption);
        
        // Añadir productos
        result.records.forEach(record => {
            const option = document.createElement('option');
            option.value = record.get('id');
            const category = record.get('category') || 'Sin categoría';
            const price = record.get('price');
            option.textContent = `${record.get('name')} (€${price} - ${category})`;
            productSelect.appendChild(option);
        });
        
        await session.close();
    } catch (error) {
        console.error('Error al cargar productos:', error);
        showProductAssignmentStatus('Error al cargar productos', false);
    }
}

// Crear nuevo usuario en Neo4j
async function createNewUser(userId, userName) {
    if (!driver) {
        showUserCreationStatus('Error: No hay conexión a Neo4j', false);
        return;
    }

    userCreationStatus.innerHTML = 'Creando usuario...';
    userCreationStatus.className = 'status-success';
    
    try {
        const session = driver.session();
        
        // Verificar si el usuario ya existe
        const checkResult = await session.run(`
            MATCH (u:User {id: $userId})
            RETURN count(u) as count
        `, { userId });
        
        const count = checkResult.records[0].get('count');
        
        if (count > 0) {
            showUserCreationStatus('Error: Este ID de usuario ya existe', false);
            await session.close();
            return;
        }
        
        const result = await session.run(`
            CREATE (u:User {id: $userId, name: $userName})
            RETURN u
        `, { userId, userName });

        const option = document.createElement('option');
        option.value = userId;
        option.textContent = userName;
        userSelector.appendChild(option);
        
        showUserCreationStatus(`Usuario "${userName}" creado exitosamente`, true);
        
        setTimeout(() => {
            newUserForm.reset();
            newUserModal.style.display = 'none';
            userCreationStatus.innerHTML = '';
            userCreationStatus.className = '';
        }, 2000);
        
        await session.close();
    } catch (error) {
        console.error('Error al crear usuario:', error);
        showUserCreationStatus('Error al crear usuario: ' + error.message, false);
    }
}

async function assignProductToUser(userId, productId, frequency) {
    if (!driver) {
        showProductAssignmentStatus('Error: No hay conexión a Neo4j', false);
        return;
    }
    
    showProductAssignmentStatus('Asignando producto...', 'pending');
    try {
        const session = driver.session();
        
        const checkResult = await session.run(`
            MATCH (u:User {id: $userId})-[p:PURCHASED]->(product:Product {id: $productId})
            RETURN p
        `, { userId, productId });
        
        let result;
        
        if (checkResult.records.length > 0) {
            result = await session.run(`
                MATCH (u:User {id: $userId})-[p:PURCHASED]->(product:Product {id: $productId})
                SET p.frequency = $frequency
                RETURN u.name AS userName, product.name AS productName
            `, { userId, productId, frequency });
        } else {
            result = await session.run(`
                MATCH (u:User {id: $userId}), (product:Product {id: $productId})
                CREATE (u)-[p:PURCHASED {frequency: $frequency}]->(product)
                RETURN u.name AS userName, product.name AS productName
            `, { userId, productId, frequency });
        }
        
        if (result.records.length > 0) {
            const userName = result.records[0].get('userName');
            const productName = result.records[0].get('productName');
            
            showProductAssignmentStatus(`Producto "${productName}" asignado a "${userName}" con frecuencia ${frequency}`, true);
            
            if (currentUser === userId) {
                await loadUserPurchases(userId);
                await loadRecommendations(userId);
                visualizeGraph(driver, userId);
            }
            
            setTimeout(() => {
                assignProductForm.reset();
                assignProductModal.style.display = 'none';
                productAssignmentStatus.innerHTML = '';
                productAssignmentStatus.className = '';
            }, 2000);
        } else {
            showProductAssignmentStatus('Error: No se pudo completar la asignación', false);
        }
        
        await session.close();
    } catch (error) {
        console.error('Error al asignar producto:', error);
        showProductAssignmentStatus('Error: ' + error.message, false);
    }
}

function showUserCreationStatus(message, isSuccess) {
    userCreationStatus.textContent = message;
    userCreationStatus.className = isSuccess ? 'status-success' : 'status-error';
}

function showProductAssignmentStatus(message, status) {
    productAssignmentStatus.textContent = message;
    
    if (status === 'pending') {
        productAssignmentStatus.className = 'status-pending';
    } else if (status === true) {
        productAssignmentStatus.className = 'status-success';
    } else {
        productAssignmentStatus.className = 'status-error';
    }
}

function resetView() {
    currentUser = null;
    userPurchasesContainer.innerHTML = '<p class="no-selection">Selecciona un usuario para ver sus compras</p>';
    recommendationsContainer.innerHTML = '<p class="no-selection">Selecciona un usuario para ver recomendaciones</p>';
    graphContainer.innerHTML = '<p>Selecciona un usuario para ver la visualización del grafo</p>';
}

async function loadUserPurchases(userId) {
    if (!driver) {
        console.error('No hay conexión a Neo4j');
        return;
    }

    userPurchasesContainer.innerHTML = '<p>Cargando compras del usuario...</p>';
    
    try {
        const session = driver.session();
        const result = await session.run(`
            MATCH (u:User {id: $userId})-[p:PURCHASED]->(product:Product)
            OPTIONAL MATCH (product)-[:BELONGS_TO]->(category:Category)
            RETURN product, p.frequency AS frequency, category
        `, { userId });
        
        if (result.records.length === 0) {
            userPurchasesContainer.innerHTML = '<p class="no-selection">Este usuario no tiene compras registradas</p>';
            return;
        }
        
        let purchasesHTML = '';
        result.records.forEach(record => {
            const product = record.get('product').properties;
            const frequency = record.get('frequency');
            const category = record.get('category') ? record.get('category').properties : { name: 'Sin categoría' };
            
            purchasesHTML += createProductCardHTML(
                product, 
                category, 
                null, 
                `Comprado ${frequency} ${frequency === 1 ? 'vez' : 'veces'}`
            );
        });
        
        userPurchasesContainer.innerHTML = purchasesHTML;
        addProductCardListeners();
        
        await session.close();
    } catch (error) {
        console.error('Error al cargar compras:', error);
        userPurchasesContainer.innerHTML = '<p class="no-selection">Error al cargar las compras</p>';
    }
}

async function loadRecommendations(userId) {
    if (!driver) {
        console.error('No hay conexión a Neo4j');
        return;
    }
    
    recommendationsContainer.innerHTML = '';
    loadingIndicator.classList.remove('hidden');
    
    try {
        const session = driver.session();
        
        const result = await session.run(`
            // Consulta BFS simplificada para recomendaciones
            MATCH (user:User {id: $userId})-[:PURCHASED]->(boughtProduct:Product)
            
            // Primera opción: Productos similares directos (1 salto)
            MATCH (boughtProduct)-[similar:SIMILAR]->(recommendedProduct:Product)
            WHERE NOT (user)-[:PURCHASED]->(recommendedProduct)
            
            // Obtener información de categoría
            OPTIONAL MATCH (recommendedProduct)-[:BELONGS_TO]->(category:Category)
            
            // Calcular puntuación basada en similitud
            WITH user, recommendedProduct, category, similar.strength AS score
            
            RETURN 
                recommendedProduct AS product,
                recommendedProduct.name AS ProductName,
                recommendedProduct.price AS Price,
                category, 
                score AS RecommendationScore
            
            UNION
            
            // Segunda opción: Productos de la misma categoría
            MATCH (user:User {id: $userId})-[:PURCHASED]->(boughtProduct:Product)
            MATCH (boughtProduct)-[:BELONGS_TO]->(category:Category)
            MATCH (recommendedProduct:Product)-[:BELONGS_TO]->(category)
            WHERE NOT (user)-[:PURCHASED]->(recommendedProduct)
            AND NOT (boughtProduct)-[:SIMILAR]->(recommendedProduct)
            
            RETURN 
                recommendedProduct AS product,
                recommendedProduct.name AS ProductName,
                recommendedProduct.price AS Price,
                category,
                0.5 AS RecommendationScore
            
            ORDER BY RecommendationScore DESC, Price
            LIMIT 5
        `, { userId });
        
        loadingIndicator.classList.add('hidden');
        
        if (result.records.length === 0) {
            recommendationsContainer.innerHTML = '<p class="no-selection">No hay recomendaciones disponibles para este usuario</p>';
            return;
        }
        
        let recommendationsHTML = '';
        result.records.forEach(record => {
            const product = record.get('product').properties;
            const category = record.get('category') ? record.get('category').properties : { name: 'Sin categoría' };
            const score = record.get('RecommendationScore');
            
            recommendationsHTML += createProductCardHTML(
                product, 
                category, 
                score.toFixed(2)
            );
        });
        
        recommendationsContainer.innerHTML = recommendationsHTML;
        addProductCardListeners();
        
        await session.close();
    } catch (error) {
        console.error('Error al cargar recomendaciones:', error);
        loadingIndicator.classList.add('hidden');
        recommendationsContainer.innerHTML = '<p class="no-selection">Error al cargar recomendaciones</p>';
    }
}

// Función para visualizar el grafo
async function visualizeGraph(driver, userId) {
    // Validaciones
    if (!driver) {
        console.error('No hay conexión a Neo4j');
        return;
    }
    
    if (typeof d3 === 'undefined') {
        console.error('D3.js no está disponible');
        graphContainer.innerHTML = '<p>La visualización del grafo requiere D3.js.</p>';
        return;
    }
    
    graphContainer.innerHTML = '<p>Cargando visualización del grafo...</p>';
    
    try {
        const session = driver.session();

        const result = await session.run(`
            // Obtener el usuario
            MATCH (user:User {id: $userId})
            
            // Buscar productos comprados por el usuario
            MATCH (user)-[purchase:PURCHASED]->(product:Product)
            
            // Buscar productos similares y categorías
            OPTIONAL MATCH (product)-[similar:SIMILAR]-(similarProduct:Product)
            OPTIONAL MATCH (product)-[belongsTo:BELONGS_TO]->(category:Category)
            
            // Devolver todo para visualización
            RETURN 
                user, 
                product, 
                purchase, 
                similarProduct, 
                similar,
                category,
                belongsTo
        `, { userId });
        

        await session.close();
        
        const nodes = [];
        const links = [];
        const nodeIds = new Set();
        
        result.records.forEach(record => {
            // Extraer el usuario
            const user = record.get('user');
            if (user && !nodeIds.has(safeGetNodeId(user))) {
                nodes.push({
                    id: safeGetNodeId(user),
                    label: user.properties.name,
                    type: 'User'
                });
                nodeIds.add(safeGetNodeId(user));
            }
            
            const product = record.get('product');
            if (product && !nodeIds.has(safeGetNodeId(product))) {
                nodes.push({
                    id: safeGetNodeId(product),
                    label: product.properties.name,
                    type: 'Product'
                });
                nodeIds.add(safeGetNodeId(product));
            }
            
            const purchase = record.get('purchase');
            if (user && product && purchase) {
                links.push({
                    source: safeGetNodeId(user),
                    target: safeGetNodeId(product),
                    type: 'PURCHASED',
                    value: purchase.properties.frequency || 1
                });
            }
            
            const similarProduct = record.get('similarProduct');
            if (similarProduct && !nodeIds.has(safeGetNodeId(similarProduct))) {
                nodes.push({
                    id: safeGetNodeId(similarProduct),
                    label: similarProduct.properties.name,
                    type: 'Product'
                });
                nodeIds.add(safeGetNodeId(similarProduct));
            }
            
            const similar = record.get('similar');
            if (product && similarProduct && similar) {
                links.push({
                    source: safeGetNodeId(product),
                    target: safeGetNodeId(similarProduct),
                    type: 'SIMILAR',
                    value: similar.properties.strength || 0.5
                });
            }
            
            const category = record.get('category');
            if (category && !nodeIds.has(safeGetNodeId(category))) {
                nodes.push({
                    id: safeGetNodeId(category),
                    label: category.properties.name,
                    type: 'Category'
                });
                nodeIds.add(safeGetNodeId(category));
            }
            
            const belongsTo = record.get('belongsTo');
            if (product && category && belongsTo) {
                links.push({
                    source: safeGetNodeId(product),
                    target: safeGetNodeId(category),
                    type: 'BELONGS_TO',
                    value: 1
                });
            }
        });
        
        if (nodes.length === 0) {
            graphContainer.innerHTML = '<p>No hay datos suficientes para visualizar el grafo.</p>';
            return;
        }
        

        graphContainer.innerHTML = '';
        
        const width = graphContainer.clientWidth;
        const height = 500;
        
        const svg = d3.select('#graph-container')
            .append('svg')
            .attr('width', width)
            .attr('height', height);
            
        const nodeColors = {
            'User': '#4CAF50',
            'Product': '#2196F3',
            'Category': '#FF9800'
        };
        
        const linkColors = {
            'PURCHASED': '#4CAF50',
            'SIMILAR': '#2196F3',
            'BELONGS_TO': '#FF9800'
        };
        
        const simulation = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id(d => d.id).distance(100))
            .force('charge', d3.forceManyBody().strength(-200))
            .force('center', d3.forceCenter(width / 2, height / 2));
            
        const link = svg.append('g')
            .attr('class', 'links')
            .selectAll('line')
            .data(links)
            .enter()
            .append('line')
            .attr('stroke', d => linkColors[d.type] || '#999')
            .attr('stroke-width', d => Math.max(1, d.value * 2))
            .attr('stroke-dasharray', d => d.type === 'BELONGS_TO' ? '5,5' : '0');
            
        const node = svg.append('g')
            .attr('class', 'nodes')
            .selectAll('circle')
            .data(nodes)
            .enter()
            .append('circle')
            .attr('r', d => d.type === 'User' ? 15 : 10)
            .attr('fill', d => nodeColors[d.type] || '#999')
            .call(d3.drag()
                .on('start', dragstarted)
                .on('drag', dragged)
                .on('end', dragended));
                
        const text = svg.append('g')
            .attr('class', 'labels')
            .selectAll('text')
            .data(nodes)
            .enter()
            .append('text')
            .text(d => d.label)
            .attr('font-size', '10px')
            .attr('dx', 12)
            .attr('dy', 4);
            
        node.append('title')
            .text(d => d.label);
            
        simulation.on('tick', () => {
            link
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);
                
            node
                .attr('cx', d => d.x)
                .attr('cy', d => d.y);
                
            text
                .attr('x', d => d.x)
                .attr('y', d => d.y);
        });
        
        function dragstarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }
        
        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }
        
        function dragended(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }
        
        const legend = svg.append('g')
            .attr('class', 'legend')
            .attr('transform', 'translate(20, 20)');
            
        Object.entries(nodeColors).forEach(([key, color], i) => {
            const g = legend.append('g')
                .attr('transform', `translate(0, ${i * 20})`);
                
            g.append('circle')
                .attr('r', 6)
                .attr('fill', color);
                
            g.append('text')
                .attr('x', 15)
                .attr('y', 4)
                .text(key)
                .attr('font-size', '12px');
        });
        
        console.log('Visualización del grafo generada con éxito');
        
    } catch (error) {
        console.error('Error al visualizar el grafo:', error);
        graphContainer.innerHTML = '<p>Error al generar la visualización del grafo: ' + error.message + '</p>';
    }
}

function createProductCardHTML(product, category, score = null, additionalInfo = null) {
    return `
    <div class="product-card" data-product-id="${product.id}">
        <div class="product-image">
            ${product.name.charAt(0)}
        </div>
        <div class="product-info">
            <div class="product-name">${product.name}</div>
            <div class="product-price">€${product.price}</div>
            <div class="product-category">${category.name}</div>
            ${score ? `<div class="recommendation-score">Score: ${score}</div>` : ''}
            ${additionalInfo ? `<div class="additional-info">${additionalInfo}</div>` : ''}
        </div>
    </div>
    `;
}

function addProductCardListeners() {
    const productCards = document.querySelectorAll('.product-card');
    productCards.forEach(card => {
        card.addEventListener('click', async () => {
            const productId = card.getAttribute('data-product-id');
            await showProductDetails(productId);
        });
    });
}

async function showProductDetails(productId) {
    if (!driver) {
        console.error('No hay conexión a Neo4j');
        return;
    }
    
    try {
        const session = driver.session();
        const result = await session.run(`
            MATCH (product:Product {id: $productId})
            OPTIONAL MATCH (product)-[:BELONGS_TO]->(category:Category)
            OPTIONAL MATCH (product)-[similar:SIMILAR]-(similarProduct:Product)
            WITH product, category, 
                 COLLECT({product: similarProduct, strength: similar.strength}) AS similarProducts
            RETURN product, category, similarProducts
        `, { productId });
        
        if (result.records.length === 0) {
            productDetails.innerHTML = '<p>No se encontró información para este producto</p>';
            modal.style.display = 'block';
            return;
        }
        
        const record = result.records[0];
        const product = record.get('product').properties;
        const category = record.get('category') ? record.get('category').properties : { name: 'Sin categoría' };
        const similarProducts = record.get('similarProducts');
        
        let similarProductsHTML = '';
        if (similarProducts && similarProducts.length > 0) {
            similarProducts.forEach(sp => {
                similarProductsHTML += `
                <div class="similar-product">
                    <span>${sp.product.properties.name}</span>
                    <span class="similarity-strength">(${(sp.strength * 100).toFixed(0)}% similar)</span>
                </div>
                `;
            });
        }
        
        productDetails.innerHTML = `
            <h2>${product.name}</h2>
            <div class="product-details-content">
                <div class="product-details-main">
                    <p><strong>Precio:</strong> €${product.price}</p>
                    <p><strong>Categoría:</strong> ${category.name}</p>
                    <p><strong>ID:</strong> ${product.id}</p>
                </div>
                <div class="product-details-similar">
                    <h4>Productos Similares</h4>
                    ${
                        similarProductsHTML || 
                        '<p>No hay productos similares registrados</p>'
                    }
                </div>
            </div>
        `;
        
        modal.style.display = 'block';
        await session.close();
    } catch (error) {
        console.error('Error al cargar detalles del producto:', error);
        productDetails.innerHTML = '<p>Error al cargar los detalles del producto</p>';
        modal.style.display = 'block';
    }
}

window.addEventListener('beforeunload', () => {
    if (driver) {
        driver.close();
    }
});