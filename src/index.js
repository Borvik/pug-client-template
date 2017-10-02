'use strict';

const pug = require('pug');
const pugRuntimeSources = require('pug-runtime/lib/sources');
const runtimeWrap = require('pug-runtime/wrap');

class PugClientTemplate {

  static init() {
    let self = new PugClientTemplate();
    self.tmpl = {};
    return (req, res, next) => {
      self.register(res);
      next();
    };
  }

  register(res) {
    let self = this;

    if (typeof res.locals.plugins !== 'undefined' && !Array.isArray(res.locals.plugins)) {
      throw new Error('res.locals.plugins is already in use - perhaps by a different node module');
    }

    if (typeof res.locals.plugins === 'undefined') {
      res.locals.plugins = [];
    }

    res.locals.plugins.push({
      lex: { include: self.handleLexClientTemplate },
      parse: {
        expressionTokens: {
          "pugtemplate": function(parser) { return self.parseClientTemplate(parser); },
          "pugruntime": function(parser) { return self.parsePugRuntime(parser); }
        }
      }
    });

    let pug_compile = pug.compile;
    self.compile_level = 0;
    pug.compile = function(str, options) {
      if (!self.compile_level) self.compileOptions = options || {};
      self.compile_level++;

      let result = pug_compile.call(pug, str, options);

      self.compile_level--;
      if (!self.compile_level) self.compileOptions = null;

      return result;
    };

    let pug_compileClientWithDependenciesTracked = pug.compileClientWithDependenciesTracked;
    pug.compileClientWithDependenciesTracked = function(str, options) {
      if (!self.compile_level) self.compileOptions = options || {};
      self.compile_level++;

      let result = pug_compileClientWithDependenciesTracked(str, options);

      self.compile_level--;
      if (!self.compile_level) self.compileOptions = null;

      return result;
    };
  }

  handleLexClientTemplate(lexer) {
    let token = lexer.scan(/^pugtemplate(?=\(| |$|\n)/, 'pugtemplate');
    if (token) {
      lexer.tokens.push(token);
      lexer.callLexerFunction('attrs');
      lexer.interpolationAllowed = false;
      lexer.callLexerFunction('pipelessText');
      return true;
    }

    token = lexer.scan(/^pugruntime(?=\(| |$|\n)/, 'pugruntime');
    if (token) lexer.tokens.push(token);
  }

  parsePugRuntime(parser) {
    let tok = parser.expect('pugruntime');
    
    let runtime = '(function(){window.pug={};';
    let propNames = Object.getOwnPropertyNames(pugRuntimeSources);
    propNames.sort().forEach(name => {
      if (name === 'rethrow') return;
      runtime += pugRuntimeSources[name];
      runtime += 'window.pug.' + name + '=' + 'pug_' + name + ';';
    });
    runtime += '})();';
    
    return {
      type: 'Tag',
      name: 'script',
      selfClosing: false,
      block: {
        type: 'Block',
        nodes: [{
          type: 'Text',
          val: runtime,
          line: tok.line,
          column: tok.col,
          filename: parser.filename
        }],
        line: tok.line,
        filename: parser.filename
      },
      attrs: [],
      attributeBlocks: [],
      isInline: false,
      line: tok.line,
      filename: parser.filename
    };
  }

  parseClientTemplate(parser) {
    let tok = parser.expect('pugtemplate');
    let block, attrs = [];

    if (parser.peek().type === 'start-attributes') {
      attrs = parser.attrs();
    }

    let nameAttr = attrs.find(attr => attr.name === 'name');
    let objAttr = attrs.find(attr => attr.name === 'obj');
    let dataAttr = attrs.find(attr => attr.name === 'data');
    if (!nameAttr) {
      parser.error('INVALID_TOKEN', 'Missing "name" attribute on pugtemplate', tok);
    }
    if (!objAttr) {
      objAttr = {val: "'templates'"};
    }
    
    let objectName = objAttr.val.substring(1, objAttr.val.length - 1);
    let templateName = nameAttr.val.substring(1, nameAttr.val.length - 1);

    if (templateName && dataAttr) {
      if (!this.tmpl[templateName])
        parser.error('INVALID_TOKEN', 'PugTemplate "' + templateName + '" has not been defined', tok);
        
      let tmplResult = this.tmpl[templateName](this.compileOptions[dataAttr.val]);
      return {
        type: 'Block',
        nodes: [{
          type: 'Text',
          val: tmplResult,
          line: tok.line,
          column: tok.col,
          filename: parser.filename
        }],
        line: tok.line,
        filename: parser.filename
      };
    }

    block = parser.parseTextBlock() || parser.emptyBlock(tok.line);
    let templateText = block.nodes.map(function(node) { return node.val; }).join('');
    
    let fnBody = pug.compileClient(templateText, {
      compileDebug: false,
      inlineRuntimeFunctions: false,
      name: templateName,
      filename: parser.filename,
      pretty: this.compileOptions.pretty,
      globals: this.compileOptions.globals,
      self: this.compileOptions.self,
      filters: this.compileOptions.filters,
      filterOptions: this.compileOptions.filterOptions,
      filterAliases: this.compileOptions.filterAliases,
      plugins: this.compileOptions.plugins
    });

    this.tmpl[templateName] = runtimeWrap(fnBody, templateName);

    let templateFunction = 'if(!window.' + objectName + '){window.' + objectName + '={};}' +
      'window.' + objectName + '.' + 
      templateName + '=' + fnBody;
    
    return {
      type: 'Tag',
      name: 'script',
      selfClosing: false,
      block: {
        type: 'Block',
        nodes: [{
          type: 'Text',
          val: templateFunction,
          line: tok.line,
          column: tok.col,
          filename: parser.filename
        }],
        line: tok.line,
        filename: parser.filename
      },
      attrs: [],
      attributeBlocks: [],
      isInline: false,
      line: tok.line,
      filename: parser.filename
    };
  }
}

module.exports = PugClientTemplate.init();