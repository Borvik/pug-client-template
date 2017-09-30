const pug = require('pug');
const buildRuntime = require('pug-runtime/build');
let pug_walk = require('pug-walk');

class PugClientTemplate {

  static init() {
    let self = new PugClientTemplate();
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
          "pugtemplate": self.parseClientTemplate
        }
      }
    });
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
  }

  parseClientTemplate(parser) {
    let tok = parser.expect('pugtemplate');
    let block, attrs = [];

    if (parser.peek().type === 'start-attributes') {
      attrs = parser.attrs();
    }

    let nameAttr = attrs.find(attr => attr.name === 'name');
    let objAttr = attrs.find(attr => attr.name === 'obj');
    if (!nameAttr) {
      parser.error('INVALID_TOKEN', 'Missing "name" attribute on pugtemplate', tok);
    }
    if (!objAttr) {
      objAttr = {val: "'templates'"};
    }
    
    let objectName = objAttr.val.substring(1, objAttr.val.length - 1);
    let templateName = nameAttr.val.substring(1, nameAttr.val.length - 1);

    block = parser.parseTextBlock() || parser.emptyBlock(tok.line);
    let templateText = block.nodes.map(function(node) { return node.val; }).join('');
    
    let templateFunction = 'if(!window.' + objectName + '){window.' + objectName + '={};}' +
      'window.' + objectName + '.' + 
      templateName + '=' + pug.compileClient(templateText, {
        compileDebug: false,
        inlineRuntimeFunctions: false,
        name: templateName
      });
    
    let pugRuntime = '';
    if (!this.pugRuntimeOutput) {
      let pugFunctions = [
        "has_own_property",
        "merge",
        "classes_array",
        "classes_object",
        "classes",
        "style",
        "attr",
        "attrs",
        "match_html",
        "escape",
        "rethrow"
      ];

      pugRuntime = '(function() {';
      pugRuntime += buildRuntime(pugFunctions);
      pugRuntime += 'window.pug={};';
      pugFunctions.forEach(fn => {
        pugRuntime += 'window.pug.' + fn + '=' + 'pug_' + fn + ';';
      });
      pugRuntime +='})();';
      this.pugRuntimeOutput = true;
    }
    block = {
      type: 'Block',
      nodes: [
        {
          type: 'Text',
          val: pugRuntime + templateFunction,
          line: tok.line,
          column: tok.col,
          filename: parser.filename
        }
      ],
      line: tok.line,
      filename: parser.filename
    };
    
    return {
      type: 'Tag',
      name: 'script',
      selfClosing: false,
      block,
      attrs: [],
      attributeBlocks: [],
      isInline: false,
      line: tok.line,
      filename: parser.filename
    };
  }
}

module.exports = PugClientTemplate.init();