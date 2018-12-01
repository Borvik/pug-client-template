# pug-client-template
Node middleware to allow parts of the pug template to be passed on and used in the browser.

This enables two new tags for pug files `pugruntime` and `pugtemplate`.

* `pugruntime` - Outputs the pug runtime functions to the object `window.pug` (created by the tag).
* `pugtemplate` - Outputs the block below it as a template function usable by client-side javascript.

The `pugtemplate` works just like `mixins`, and in fact compile to a mixin as well as the client side, so can be called just like a mixin would.

```
pugtemplate templateName(arg1, arg2, ...restArgs)
```

### DEPRECATION NOTICE - namespaces will be deprecated in a future version.

The template name may be namespaced using dot notation.  This allows you to specify which window variable will get the template function.  If you do not specify a namespace, the default `templates` will be used.  The name for the mixin will use the name with the dot replaced with an underscore.

```
pugtemplate tmpl.templateName(arg1)
+tmpl_templateName('arg')
```

# Installation

This might work on earlier version of NodeJS, however the NPM version of >=3.0.0 should be followed (as most new installations today have that by default it shouldn't be to hard).  NPM 3.0 started flattening dependencies, which this relies on - as the only listed dependency is Pug - though it still uses some of the dependencies of Pug.

```
npm install pug-client-template
```

# Example
```pug
body
  #templateResult
  pugtemplate my_template(testVar)
    .my-template #{testVar}
  +my_template(varPassedIn)
  pugruntime
  script.
    $(function() {
      $('#templateResult').html(templates.my_template('Working'));
    });
```
Abbreviated output
```html
<body>
  <div id="templateResult"></div>
  <div class="my-template">{value of varPassedIn}</div>
  <script>
    (function() {
      if (!window.templates) {
        window.templates = {};
      }
      if (!window.pug_mixins) {
        window.pug_mixins = {};
        window.pug_mixin_level = 0;
        window.pug_html = "";
      }
      window.templates.my_template = function my_template(arg1) {
        /* this is the compiled template function */
      };
    })();
  </script>
  <script>
    (function() {
      window.pug = {};
      function pug_attrs(t,r) {/* a pug runtime function - there are more than one */}
      window.pug.attrs = pug_attrs;
    })();
  </script>
  <script>
    $(function() {
      $('#templateResult').html(templates.my_template('Working'));
    });
  </script>
</body>
```