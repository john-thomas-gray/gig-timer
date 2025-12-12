12/13

12/12
Rewrote assignments page functionality from scratch. Learned about the
relationship betweeen the service worker / background, the content, and the
bridge.

The service worker manages the background tasks and listens for browser events.
It coordinates communication between parts of the extension. It has no DOM access.
Cannot access window, document or other page specific objects. Its execution
context is separate from web pages.

The content script is javascript that runs in the context of a web page. It can
access and manipulate the DOM, but it lives in a separate JS world. It can
extract data and inject UI elements, but it cannot access the page's JS
variables/functions directly. It can communicate with the bridge and service worker
through messaging.

The bridge is JS injected directly into the page's execution context. It can access
the page's JS objects and variables. It can execute code in the same context
as the page's own scripts. It can extract and send data to the content script
with custom events. It cannot access chrome apis. It's less secure.

The elements on the assignments page are dynamically loaded and unload. Therefore,
I could not rely on accessing the dom directly with a content script to get
project data from the w2ui grid, a page specific javascript object from a library
for creaing ui. I needed to inject a bridge script.

My service-worker.js sent a message to the content script whenever the assigments page
was detected. The assignments.js page requested the w2ui info from assignmentsBridge.js
and the assignmentsBridge sent the info to the content script to the service worker.

The service worker parsed the w2ui data, formatted it as objects with keys of my
choosing and saved those objects to the google.storage.sync projects array. This automatic
functionality has made the inputs on the options page obsolete.

I also added a listener on the workplace page to automatically get the workplaceUrl
for each project. The project checks its Id against data in the DOM and determines
which project to put that workplace's url in.

Moving forward, I've got to account for the calculated values saved in the project
objects. Should allow edits on options page. Should add idle overlay. Edit Sheets page.
