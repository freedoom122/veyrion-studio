const Cart = require('../models/Cart');

const cartController = {
  get(req, res, next) {
    try {
      const sessionId = req.cookies?.cart_session || `guest-${req.ip}-${Date.now()}`;
      const cart = Cart.findOrCreate({ user_id: req.user?.id, session_id: sessionId });
      const items = Cart.getItems(cart.id);
      const total = Cart.getTotal(cart.id);
      const itemCount = Cart.getItemCount(cart.id);

      res.cookie('cart_session', cart.session_id, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });

      res.json({ success: true, data: { cart: { id: cart.id, items, total, itemCount } } });
    } catch (err) { next(err); }
  },

  addItem(req, res, next) {
    try {
      const { product_id, quantity = 1 } = req.body;
      const sessionId = req.cookies?.cart_session || `guest-${req.ip}-${Date.now()}`;
      const cart = Cart.findOrCreate({ user_id: req.user?.id, session_id: sessionId });
      Cart.addItem(cart.id, product_id, parseInt(quantity));

      const items = Cart.getItems(cart.id);
      const total = Cart.getTotal(cart.id);
      const itemCount = Cart.getItemCount(cart.id);

      res.cookie('cart_session', cart.session_id, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
      res.json({ success: true, data: { cart: { id: cart.id, items, total, itemCount } } });
    } catch (err) { next(err); }
  },

  updateItem(req, res, next) {
    try {
      const { quantity } = req.body;
      Cart.updateItemQuantity(parseInt(req.params.itemId), parseInt(quantity));
      const sessionId = req.cookies?.cart_session;
      if (!sessionId) return res.json({ success: true, data: { message: 'Updated' } });
      const cart = Cart.findOrCreate({ user_id: req.user?.id, session_id: sessionId });
      const items = Cart.getItems(cart.id);
      const total = Cart.getTotal(cart.id);
      const itemCount = Cart.getItemCount(cart.id);
      res.json({ success: true, data: { cart: { id: cart.id, items, total, itemCount } } });
    } catch (err) { next(err); }
  },

  removeItem(req, res, next) {
    try {
      Cart.removeItem(parseInt(req.params.itemId));
      const sessionId = req.cookies?.cart_session;
      if (!sessionId) return res.json({ success: true, data: { message: 'Removed' } });
      const cart = Cart.findOrCreate({ user_id: req.user?.id, session_id: sessionId });
      const items = Cart.getItems(cart.id);
      const total = Cart.getTotal(cart.id);
      const itemCount = Cart.getItemCount(cart.id);
      res.json({ success: true, data: { cart: { id: cart.id, items, total, itemCount } } });
    } catch (err) { next(err); }
  },
};

module.exports = cartController;
