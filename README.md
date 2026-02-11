# ftree &middot; [![GitHub license](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](https://github.com/ainh01/ftree/blob/main/LICENSE)  
> Interactive Folder Structure Builder  

A web-based tool to visually create, edit, and manage folder structures, then export them as ASCII art or YAML-like text.  

## Installing / Getting started  

To use ftree, simply open the `ftree.html` file in your web browser. No installation or server is required.  

```  
git clone https://github.com/ainh01/ftree.git  
cd ftree/  
open ftree.html  
```  

This will open the application in your default web browser, allowing you to start building folder structures immediately.  

## Developing  

### Built With  
* JavaScript (ES6+)  
* HTML5  
* CSS3  

### Prerequisites  
A modern web browser (e.g., Chrome, Firefox, Edge, Safari) is all that is needed.  

### Setting up Dev  

```shell  
git clone https://github.com/ainh01/ftree.git  
cd ftree/  
```  

After cloning the repository, navigate into the `ftree` directory. You can then open `ftree.html` in your web browser to run the application locally. All development is done directly on the HTML, CSS, and JavaScript files.  

### Building  
No specific build steps are required as this is a front-end only application. Changes made to `ftree.html`, `public/css/index.css`, and `public/js/index.js` are reflected by simply refreshing the browser page.  

### Deploying / Publishing  
To deploy, simply host the entire `ftree` folder (including `ftree.html`, `public/css/`, and `public/js/`) on any static web server or platform that supports static file hosting.  

## Versioning  

We use [SemVer](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/ainh01/ftree/tags).  

## Configuration  

The application's configuration parameters are defined within `public/js/index.js` in the `CONFIG` object:  

* `STORAGE_KEY`: Key for local storage.  
* `AUTO_SAVE_DELAY`: Delay for auto-saving (in milliseconds).  
* `TOAST_DURATION`: Duration for toast notifications (in milliseconds).  
* `MAX_NAME_LENGTH`: Maximum length for node names.  
* `ID_LENGTH`: Length for generated unique IDs.  
* `RESPONSIVE_BREAKPOINT`: Screen width for responsive design (in pixels).  
* `YAML_INDENT_SIZE`: Indentation size for YAML-like structure (in spaces).  
* `YAML_FOLDER_PREFIX`: Prefix for folders in YAML-like import/export.  
* `YAML_FILE_PREFIX`: Prefix for files in YAML-like import/export.  

These values can be modified directly in `index.js` to customize application behavior.  

## Tests  
This project does not currently include automated tests. Manual testing is performed by interacting with the application in a web browser.  

## Style guide  
The project follows a consistent, readable JavaScript, HTML, and CSS style. No specific linter or style checker is enforced.  

## Api Reference  
This project does not expose an external API. All functionalities are contained within the client-side JavaScript.  

## Database  
This project does not use a database. All data is stored and retrieved locally using the browser's `localStorage`.  

## Licensing  

This project is licensed under the MIT License - see the [LICENSE](https://github.com/ainh01/ftree/blob/main/LICENSE) file for details.
