'use strict';

const CONFIG = {
    STORAGE_KEY: 'folderStructureBuilder_data',
    AUTO_SAVE_DELAY: 2000,
    TOAST_DURATION: 3000,
    MAX_NAME_LENGTH: 255,
    ID_LENGTH: 12,
    RESPONSIVE_BREAKPOINT: 768,
    YAML_INDENT_SIZE: 1,
    YAML_FOLDER_PREFIX: 'd',
    YAML_FILE_PREFIX: 'f',
};

function generateUniqueId() {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 2 + CONFIG.ID_LENGTH);
    return `${timestamp}-${randomStr}`;
}

function sanitizeNodeName(name) {
    if (!name) return '';
    return name
        .replace(/[\n\r\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, CONFIG.MAX_NAME_LENGTH);
}

function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
                <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
                <span>${message}</span>
            `;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => toast.remove(), 300);
    }, CONFIG.TOAST_DURATION);
}

async function copyToClipboardWithFallback(text) {
    if (navigator.clipboard && window.isSecureContext) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
        }
    }

    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
        const successful = document.execCommand('copy');
        textArea.remove();
        return successful;
    } catch (err) {
        textArea.remove();
        return false;
    }
}

class TreeNode {
    constructor(name, type = 'folder') {
        this.id = generateUniqueId();
        this.name = sanitizeNodeName(name);
        this.type = type;
        this.children = [];
        this.createdAt = Date.now();
    }

    addChild(node) {
        if (this.type !== 'folder') {
            return false;
        }
        this.children.push(node);
        return true;
    }

    removeChild(id) {
        if (!id) {
            return false;
        }

        const initialLength = this.children.length;
        this.children = this.children.filter(child => {
            if (!child || !child.id) {
                return false;
            }
            return child.id !== id;
        });

        const removed = this.children.length < initialLength;

        return removed;
    }

    findNode(id) {
        if (this.id === id) return this;

        for (const child of this.children) {
            const found = child.findNode(id);
            if (found) return found;
        }

        return null;
    }

    findParent(id, parent = null) {
        if (this.id === id) {
            return parent;
        }

        for (const child of this.children) {
            const foundParent = child.findParent(id, this);
            if (foundParent) return foundParent;
        }

        return null;
    }

    getPath(id, path = []) {
        if (this.id === id) {
            return [...path, this];
        }

        for (const child of this.children) {
            const result = child.getPath(id, [...path, this]);
            if (result) return result;
        }

        return null;
    }

    isDescendant(nodeId) {
        if (this.id === nodeId) return true;

        for (const child of this.children) {
            if (child.isDescendant(nodeId)) return true;
        }

        return false;
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            children: this.children.map(child => child.toJSON()),
            createdAt: this.createdAt
        };
    }

    static fromJSON(obj) {
        const node = new TreeNode(obj.name, obj.type);
        node.id = obj.id || generateUniqueId();
        node.createdAt = obj.createdAt || Date.now();

        if (obj.children && Array.isArray(obj.children)) {
            obj.children.forEach(childObj => {
                const child = TreeNode.fromJSON(childObj);
                node.children.push(child);
            });
        }

        return node;
    }

    countNodes() {
        let count = 1;
        for (const child of this.children) {
            count += child.countNodes();
        }
        return count;
    }
}

const app = {
    root: new TreeNode('Root', 'folder'),
    selectedNodeId: null,
    editingNodeId: null,
    autoSaveTimeout: null,
    draggedNodeId: null,
    dragOverNodeId: null,

    init() {
        const loaded = this.loadFromLocalStorage(true);

        if (!loaded) {
            this.createExampleStructure();
        }

        this.setupKeyboardShortcuts();

        this.render();

        this.scheduleAutoSave();
    },

    createExampleStructure() {
        const exampleFolder = new TreeNode('Example Project', 'folder');
        exampleFolder.addChild(new TreeNode('README.md', 'file'));
        exampleFolder.addChild(new TreeNode('package.json', 'file'));

        const srcFolder = new TreeNode('src', 'folder');
        srcFolder.addChild(new TreeNode('index.js', 'file'));
        srcFolder.addChild(new TreeNode('styles.css', 'file'));

        const componentsFolder = new TreeNode('components', 'folder');
        componentsFolder.addChild(new TreeNode('Header.js', 'file'));
        componentsFolder.addChild(new TreeNode('Footer.js', 'file'));
        srcFolder.addChild(componentsFolder);

        exampleFolder.addChild(srcFolder);

        const publicFolder = new TreeNode('public', 'folder');
        publicFolder.addChild(new TreeNode('index.html', 'file'));
        publicFolder.addChild(new TreeNode('favicon.ico', 'file'));
        exampleFolder.addChild(publicFolder);

        this.root.addChild(exampleFolder);
    },

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (this.editingNodeId) return;

            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                this.saveToLocalStorage();
            }

            if (e.key === 'Delete' && this.selectedNodeId) {
                e.preventDefault();
                const node = this.root.findNode(this.selectedNodeId);
                if (node && confirm(`Delete "${node.name}" and all its contents?`)) {
                    this.deleteNode(this.selectedNodeId);
                }
            }
        });
    },

    scheduleAutoSave() {
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }

        this.autoSaveTimeout = setTimeout(() => {
            this.saveToLocalStorage(true);
        }, CONFIG.AUTO_SAVE_DELAY);
    },

    selectNode(id) {
        this.selectedNodeId = id;
        this.render();
    },

    addFolderToNode(parentId) {
        const parent = this.root.findNode(parentId);

        if (!parent) {
            showToast('Error: Parent node not found', 'error');
            return;
        }

        if (parent.type !== 'folder') {
            showToast('Cannot add items to a file', 'error');
            return;
        }

        const newFolder = new TreeNode('New Folder', 'folder');
        parent.addChild(newFolder);
        this.selectedNodeId = newFolder.id;
        this.render();
        this.scheduleAutoSave();
    },

    addFileToNode(parentId) {
        const parent = this.root.findNode(parentId);

        if (!parent) {
            showToast('Error: Parent node not found', 'error');
            return;
        }

        if (parent.type !== 'folder') {
            showToast('Cannot add items to a file', 'error');
            return;
        }

        const newFile = new TreeNode('file.txt', 'file');
        parent.addChild(newFile);
        this.selectedNodeId = newFile.id;
        this.render();
        this.scheduleAutoSave();
    },

    addRootFolder() {
        const newFolder = new TreeNode('New Folder', 'folder');
        this.root.addChild(newFolder);
        this.selectedNodeId = newFolder.id;
        this.render();
        this.scheduleAutoSave();
    },

    renameNode(id, newName) {
        const node = this.root.findNode(id);

        if (!node) {
            return;
        }

        const sanitizedName = sanitizeNodeName(newName);

        if (!sanitizedName || sanitizedName.length === 0) {
            this.showRenameError(id, 'Name cannot be empty');
            return;
        }

        node.name = sanitizedName;
        this.editingNodeId = null;
        this.render();
        this.scheduleAutoSave();

        showToast(`Renamed to "${sanitizedName}"`, 'success');
    },

    showRenameError(nodeId, message) {
        const nodeElement = document.querySelector(`[data-node-id="${nodeId}"]`);
        if (!nodeElement) return;

        nodeElement.classList.add('error');

        const input = nodeElement.querySelector('.node-name-input');
        if (input) {
            input.classList.add('error-input');
        }

        const tooltip = document.createElement('div');
        tooltip.className = 'error-tooltip';
        tooltip.textContent = message;
        nodeElement.querySelector('.node-item').appendChild(tooltip);

        setTimeout(() => {
            nodeElement.classList.remove('error');
            if (input) {
                input.classList.remove('error-input');
            }
            tooltip.remove();
        }, 2000);

        if (input) {
            input.focus();
            input.select();
        }
    },

    deleteNode(id) {
        if (id === this.root.id) {
            showToast('Cannot delete root node', 'error');
            return;
        }

        if (!id) {
            showToast('Error: Invalid node ID', 'error');
            return;
        }

        const node = this.root.findNode(id);
        if (!node) {
            showToast('Node not found', 'error');
            return;
        }

        const nodeName = node.name;

        const parent = this.root.findParent(id);

        if (!parent) {
            showToast('Error: Could not find parent node', 'error');
            return;
        }

        const removed = parent.removeChild(id);

        if (removed) {
            const stillExists = this.root.findNode(id);
            if (stillExists) {
                showToast('Error: Deletion failed', 'error');
                return;
            }

            if (this.selectedNodeId === id) {
                this.selectedNodeId = null;
            }

            this.render();
            this.scheduleAutoSave();
            showToast(`Deleted "${nodeName}"`, 'success');
        } else {
            showToast('Failed to delete node', 'error');
        }
    },

    handleDragStart(e, nodeId) {
        if (nodeId === this.root.id) {
            e.preventDefault();
            showToast('Cannot move root node', 'error');
            return;
        }

        this.draggedNodeId = nodeId;

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', nodeId);

        const nodeElement = document.querySelector(`[data-node-id="${nodeId}"] > .node-item`);
        if (nodeElement) {
            setTimeout(() => {
                nodeElement.classList.add('dragging');
            }, 0);
        }
    },

    handleDragEnd(e, nodeId) {
        const nodeElement = document.querySelector(`[data-node-id="${nodeId}"] > .node-item`);
        if (nodeElement) {
            nodeElement.classList.remove('dragging');
        }

        document.querySelectorAll('.node-item.drag-over, .node-item.drag-over-invalid').forEach(el => {
            el.classList.remove('drag-over', 'drag-over-invalid');
        });

        this.draggedNodeId = null;
        this.dragOverNodeId = null;
    },

    canDropOn(draggedId, targetId) {
        if (draggedId === targetId) {
            return false;
        }

        const targetNode = this.root.findNode(targetId);
        if (!targetNode || targetNode.type !== 'folder') {
            return false;
        }

        const draggedNode = this.root.findNode(draggedId);
        if (!draggedNode) {
            return false;
        }

        if (draggedNode.isDescendant(targetId)) {
            return false;
        }

        return true;
    },

    handleDragOver(e, nodeId) {
        e.preventDefault();

        if (!this.draggedNodeId) return;

        this.dragOverNodeId = nodeId;

        const isValid = this.canDropOn(this.draggedNodeId, nodeId);

        const nodeElement = e.currentTarget;

        document.querySelectorAll('.node-item.drag-over, .node-item.drag-over-invalid').forEach(el => {
            if (el !== nodeElement) {
                el.classList.remove('drag-over', 'drag-over-invalid');
            }
        });

        if (isValid) {
            nodeElement.classList.add('drag-over');
            nodeElement.classList.remove('drag-over-invalid');
            e.dataTransfer.dropEffect = 'move';
        } else {
            nodeElement.classList.add('drag-over-invalid');
            nodeElement.classList.remove('drag-over');
            e.dataTransfer.dropEffect = 'none';
        }
    },

    handleDragLeave(e, nodeId) {
        const nodeElement = e.currentTarget;
        nodeElement.classList.remove('drag-over', 'drag-over-invalid');
    },

    handleDrop(e, targetId) {
        e.preventDefault();
        e.stopPropagation();

        const draggedId = this.draggedNodeId;

        const nodeElement = e.currentTarget;
        nodeElement.classList.remove('drag-over', 'drag-over-invalid');

        if (!draggedId) {
            return;
        }

        if (!this.canDropOn(draggedId, targetId)) {
            showToast('Cannot drop here', 'error');
            return;
        }

        this.moveNode(draggedId, targetId);
    },

    moveNode(nodeId, newParentId) {
        if (!nodeId || !newParentId) {
            return false;
        }

        const nodeToMove = this.root.findNode(nodeId);
        const newParent = this.root.findNode(newParentId);

        if (!nodeToMove) {
            showToast('Source node not found', 'error');
            return false;
        }

        if (!newParent) {
            showToast('Target folder not found', 'error');
            return false;
        }

        const currentParent = this.root.findParent(nodeId);

        if (!currentParent) {
            showToast('Cannot move node: parent not found', 'error');
            return false;
        }

        if (currentParent.id === newParentId) {
            showToast('Already in this folder', 'info');
            return false;
        }

        const removed = currentParent.removeChild(nodeId);

        if (!removed) {
            showToast('Failed to remove from current location', 'error');
            return false;
        }

        const added = newParent.addChild(nodeToMove);

        if (!added) {
            currentParent.addChild(nodeToMove);
            showToast('Move failed: could not add to target', 'error');
            return false;
        }

        this.render();
        this.scheduleAutoSave();
        showToast(`Moved "${nodeToMove.name}" to "${newParent.name}"`, 'success');

        return true;
    },

    generateASCII() {
        let output = '';

        const traverse = (node, prefix = '', isLast = true) => {
            const icon = node.type === 'folder' ? '📁' : '📄';

            if (node.id === this.root.id) {
                output += `${icon} ${node.name}\n`;
            } else {
                const connector = isLast ? '└── ' : '├── ';
                output += `${prefix}${connector}${icon} ${node.name}\n`;
            }

            const childrenCount = node.children.length;
            node.children.forEach((child, index) => {
                const isLastChild = index === childrenCount - 1;

                let newPrefix = prefix;
                if (node.id !== this.root.id) {
                    newPrefix += isLast ? '    ' : '│   ';
                }

                traverse(child, newPrefix, isLastChild);
            });
        };

        traverse(this.root);
        return output;
    },

    renderNode(node, container, isRoot = false) {
        const nodeWrapper = document.createElement('div');
        nodeWrapper.className = `tree-node ${isRoot ? 'tree-node-root' : ''}`;
        nodeWrapper.setAttribute('data-node-id', node.id);

        const itemDiv = document.createElement('div');
        itemDiv.className = `node-item ${node.id === this.selectedNodeId ? 'selected' : ''}`;
        itemDiv.setAttribute('role', 'treeitem');
        itemDiv.setAttribute('aria-label', `${node.type} ${node.name}`);
        itemDiv.setAttribute('aria-expanded', node.children.length > 0 ? 'true' : 'false');
        itemDiv.tabIndex = 0;

        if (node.id !== this.root.id) {
            itemDiv.setAttribute('draggable', 'true');

            itemDiv.addEventListener('dragstart', (e) => this.handleDragStart(e, node.id));
            itemDiv.addEventListener('dragend', (e) => this.handleDragEnd(e, node.id));
        }

        if (node.type === 'folder') {
            itemDiv.addEventListener('dragover', (e) => this.handleDragOver(e, node.id));
            itemDiv.addEventListener('dragleave', (e) => this.handleDragLeave(e, node.id));
            itemDiv.addEventListener('drop', (e) => this.handleDrop(e, node.id));
        }

        itemDiv.onclick = (e) => {
            e.stopPropagation();
            this.selectNode(node.id);
        };

        if (node.id !== this.root.id) {
            const dragHandle = document.createElement('span');
            dragHandle.className = 'drag-handle';
            dragHandle.textContent = '⋮⋮';
            dragHandle.setAttribute('aria-label', 'Drag to move');
            dragHandle.title = 'Drag to move';
            itemDiv.appendChild(dragHandle);
        }

        const icon = document.createElement('span');
        icon.className = 'node-icon';
        icon.textContent = node.type === 'folder' ? '📁' : '📄';
        icon.setAttribute('aria-hidden', 'true');

        const nameSpan = document.createElement('span');
        nameSpan.className = `node-name ${node.id === this.editingNodeId ? 'editing' : ''}`;
        nameSpan.textContent = node.name;

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = `node-name-input ${node.id === this.editingNodeId ? 'editing' : ''}`;
        nameInput.value = node.name;
        nameInput.setAttribute('aria-label', 'Edit name');
        nameInput.maxLength = CONFIG.MAX_NAME_LENGTH;

        nameInput.onkeydown = (e) => {
            e.stopPropagation();

            if (e.key === 'Enter') {
                this.renameNode(node.id, nameInput.value);
            } else if (e.key === 'Escape') {
                this.editingNodeId = null;
                this.render();
            }
        };

        nameInput.onblur = () => {
            if (nameInput.value.trim()) {
                this.renameNode(node.id, nameInput.value);
            } else {
                this.editingNodeId = null;
                this.render();
            }
        };

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'node-actions';
        actionsDiv.setAttribute('role', 'group');
        actionsDiv.setAttribute('aria-label', 'Node actions');

        if (node.type === 'folder') {
            const addFolderBtn = document.createElement('button');
            addFolderBtn.className = 'btn-small';
            addFolderBtn.textContent = '📁+';
            addFolderBtn.title = 'Add Subfolder';
            addFolderBtn.setAttribute('aria-label', 'Add subfolder');
            addFolderBtn.onclick = (e) => {
                e.stopPropagation();
                this.addFolderToNode(node.id);
            };
            actionsDiv.appendChild(addFolderBtn);

            const addFileBtn = document.createElement('button');
            addFileBtn.className = 'btn-small';
            addFileBtn.textContent = '📄+';
            addFileBtn.title = 'Add File';
            addFileBtn.setAttribute('aria-label', 'Add file');
            addFileBtn.onclick = (e) => {
                e.stopPropagation();
                this.addFileToNode(node.id);
            };
            actionsDiv.appendChild(addFileBtn);
        }

        const renameBtn = document.createElement('button');
        renameBtn.className = 'btn-small';
        renameBtn.textContent = '✎';
        renameBtn.title = 'Rename';
        renameBtn.setAttribute('aria-label', 'Rename');
        renameBtn.onclick = (e) => {
            e.stopPropagation();
            this.editingNodeId = node.id;
            this.render();
        };
        actionsDiv.appendChild(renameBtn);

        if (node.id !== this.root.id) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn-small delete';
            deleteBtn.textContent = '🗑';
            deleteBtn.title = 'Delete';
            deleteBtn.setAttribute('aria-label', 'Delete');
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm(`Delete "${node.name}" and all its contents?`)) {
                    this.deleteNode(node.id);
                }
            };
            actionsDiv.appendChild(deleteBtn);
        }

        itemDiv.appendChild(icon);
        itemDiv.appendChild(nameSpan);
        itemDiv.appendChild(nameInput);
        itemDiv.appendChild(actionsDiv);
        nodeWrapper.appendChild(itemDiv);

        if (node.children.length > 0) {
            const childrenContainer = document.createElement('div');
            childrenContainer.setAttribute('role', 'group');

            node.children.forEach(child => {
                this.renderNode(child, childrenContainer);
            });

            nodeWrapper.appendChild(childrenContainer);
        }

        container.appendChild(nodeWrapper);
    },

    render() {
        const editorDiv = document.getElementById('treeEditor');
        editorDiv.innerHTML = '';

        if (this.root.children.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'empty-state';
            emptyState.innerHTML = `
                        <div class="empty-state-icon">📂</div>
                        <p>No folders yet. Click the button below to start building your structure!</p>
                    `;
            editorDiv.appendChild(emptyState);
        } else {
            this.renderNode(this.root, editorDiv, true);
        }

        const asciiDiv = document.getElementById('asciiPreview');
        asciiDiv.textContent = this.generateASCII();

        if (this.editingNodeId) {
            setTimeout(() => {
                const input = document.querySelector('.node-name-input.editing');
                if (input) {
                    input.focus();
                    input.select();
                }
            }, 0);
        }
    },

    async copyToClipboard() {
        const ascii = this.generateASCII();
        const success = await copyToClipboardWithFallback(ascii);

        if (success) {
            const btn = document.getElementById('copyBtn');
            const originalText = btn.textContent;
            btn.textContent = ' Copied!';
            btn.classList.add('copied');

            setTimeout(() => {
                btn.textContent = originalText;
                btn.classList.remove('copied');
            }, 2000);

            showToast('Copied to clipboard!', 'success');
        } else {
            showToast('Failed to copy to clipboard', 'error');
        }
    },

    saveToLocalStorage(silent = false) {
        try {
            const data = {
                version: '1.0',
                savedAt: new Date().toISOString(),
                root: this.root.toJSON()
            };

            localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));

            if (!silent) {
                showToast('Saved to browser storage', 'success');
            }

            return true;
        } catch (error) {
            if (!silent) {
                showToast('Failed to save: ' + error.message, 'error');
            }
            return false;
        }
    },

    loadFromLocalStorage(silent = false) {
        try {
            const savedData = localStorage.getItem(CONFIG.STORAGE_KEY);

            if (!savedData) {
                if (!silent) {
                    showToast('No saved data found', 'error');
                }
                return false;
            }

            const data = JSON.parse(savedData);
            this.root = TreeNode.fromJSON(data.root);
            this.selectedNodeId = null;
            this.editingNodeId = null;
            this.render();

            if (!silent) {
                const savedDate = new Date(data.savedAt);
                showToast(`Loaded from ${savedDate.toLocaleString()}`, 'success');
            }

            return true;
        } catch (error) {
            if (!silent) {
                showToast('Failed to load: ' + error.message, 'error');
            }
            return false;
        }
    },

    clearAll() {
        if (confirm('This will delete all your data. Are you sure?')) {
            this.root = new TreeNode('Root', 'folder');
            this.selectedNodeId = null;
            this.editingNodeId = null;
            this.draggedNodeId = null;
            this.dragOverNodeId = null;
            this.render();
            this.scheduleAutoSave();
            showToast('All data cleared', 'success');
        }
    },
    openModal(title, bodyContent, footerButtons = []) {
        const overlay = document.getElementById('modalOverlay');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        const modalFooter = document.getElementById('modalFooter');

        modalTitle.textContent = title;
        modalBody.innerHTML = bodyContent;

        modalFooter.innerHTML = '';
        footerButtons.forEach(btn => {
            const button = document.createElement('button');
            button.className = `modal-btn ${btn.className || 'modal-btn-secondary'}`;
            button.textContent = btn.text;
            button.onclick = btn.onClick;
            modalFooter.appendChild(button);
        });

        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    closeModal() {
        const overlay = document.getElementById('modalOverlay');
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    },
    copyPrompt() {
        const promptText = `Task
 Your task is to VISUALIZE a folder structure follow YAML-alike styles.
  For directory/ folder, you add "d" before the name, e.g: "dRoot" for folder Root.
  For file, you add "f" before the file, e.g "fScript.js" for file Script.js.
  The tab size is 1 space, use this space " ".
  No ":", only d and f and space.
  Does not contains the Project name folder.
 The output should properly follow this rule.
  Final result is final and won't have any extra things, e.g comments.
  Must be put in a ->\`\`\`txt\`\`\` txt markdown, this is for easy copy.
  These must be no Emoji.
  The OCR part will need to operate twice for enhancing the correctness.
 Since the task is easy and need to be completed as soon as possible, you instantly put the \`\`\`txt\`\`\` markdown and do fill the final Structure.`;
        navigator.clipboard.writeText(promptText)
            .then(() => {
            })
            .catch(err => {
            });
    },
    openImportModal() {
        const bodyContent = `
        <textarea id="importTextarea" placeholder="Paste your structure here...
Example:
dRoot
 dpublic
  findex.html
 dsrc
  fapp.js"></textarea>
        <div id="importError"></div>
    `;

        const buttons = [
            {
                text: 'Import',
                className: 'modal-btn-primary',
                onClick: () => this.handleImport()
            },
            {
                text: 'Cancel',
                className: 'modal-btn-secondary',
                onClick: () => this.closeModal()
            }
        ];

        this.openModal('Import Structure', bodyContent, buttons);
    },

    handleImport() {
        const textarea = document.getElementById('importTextarea');
        const errorDiv = document.getElementById('importError');
        const input = textarea.value;

        errorDiv.innerHTML = '';

        if (!input.trim()) {
            errorDiv.innerHTML = '<div class="error-message">Please paste a structure to import.</div>';
            textarea.classList.add('error');
            return;
        }

        const result = this.parseYAMLStructure(input);

        if (!result.success) {
            errorDiv.innerHTML = `<div class="error-message"><strong>Parse Error:</strong> ${result.error}</div>`;
            textarea.classList.add('error');
            return;
        }

        if (this.root.children.length > 0) {
            if (!confirm('This will replace your current structure. Continue?')) {
                return;
            }
        }

        this.importStructure(result.nodes);
        this.closeModal();
        showToast('Structure imported successfully!', 'success');
    },
    parseYAMLStructure(text) {
        const lines = text.split('\n').filter(line => line.length > 0);

        if (lines.length === 0) {
            return { success: false, error: 'No content to parse' };
        }

        const rootNodes = [];
        const stack = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNum = i + 1;

            const indent = line.search(/\S/);
            if (indent === -1) {
                return { success: false, error: `Line ${lineNum}: Empty or whitespace-only line` };
            }

            const level = indent / CONFIG.YAML_INDENT_SIZE;

            if (!Number.isInteger(level)) {
                return { success: false, error: `Line ${lineNum}: Invalid indentation (must be multiples of ${CONFIG.YAML_INDENT_SIZE} space)` };
            }

            const content = line.trim();

            if (!content.startsWith(CONFIG.YAML_FOLDER_PREFIX) && !content.startsWith(CONFIG.YAML_FILE_PREFIX)) {
                return { success: false, error: `Line ${lineNum}: Must start with '${CONFIG.YAML_FOLDER_PREFIX}' (folder) or '${CONFIG.YAML_FILE_PREFIX}' (file)` };
            }

            const prefix = content[0];
            const name = content.substring(1);

            if (!name || name.length === 0) {
                return { success: false, error: `Line ${lineNum}: Name cannot be empty` };
            }

            const type = prefix === CONFIG.YAML_FOLDER_PREFIX ? 'folder' : 'file';
            const node = new TreeNode(name, type);

            if (level === 0) {
                rootNodes.push(node);
                stack.length = 0;
                stack.push({ node, level: 0 });
            } else {
                while (stack.length > 0 && stack[stack.length - 1].level >= level) {
                    stack.pop();
                }

                if (stack.length === 0) {
                    return { success: false, error: `Line ${lineNum}: Invalid indentation hierarchy` };
                }

                const parent = stack[stack.length - 1];

                if (level !== parent.level + 1) {
                    return { success: false, error: `Line ${lineNum}: Indentation must increase by exactly 1 level (expected ${parent.level + 1}, got ${level})` };
                }

                if (parent.node.type !== 'folder') {
                    return { success: false, error: `Line ${lineNum}: Cannot add children to file "${parent.node.name}"` };
                }

                parent.node.addChild(node);
                stack.push({ node, level });
            }
        }

        return { success: true, nodes: rootNodes };
    },

    importStructure(nodes) {
        this.root = new TreeNode('Root', 'folder');

        nodes.forEach(node => {
            this.root.addChild(node);
        });

        this.selectedNodeId = null;
        this.editingNodeId = null;
        this.render();
        this.scheduleAutoSave();
    },
    async copyYAMLToClipboard() {
        const yaml = this.exportToYAML();
        const success = await copyToClipboardWithFallback(yaml);

        if (success) {
            showToast('YAML format copied to clipboard!', 'success');
        } else {
            showToast('Failed to copy', 'error');
        }
    },
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        app.init();
    });
} else {
    app.init();
}
