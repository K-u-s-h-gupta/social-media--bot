export const hasExtension = (path, extension) => {
    if (!path) {
        return false;
    }
    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    return path.toLowerCase().indexOf(ext.toLowerCase()) > -1;
};
//# sourceMappingURL=has.extension.js.map