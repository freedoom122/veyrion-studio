const Cart = require('../models/Cart');

const cartController = {
  get(req, res, next) {
    try {
      const sessionId = req.cookies?.cart_session || `guest-${req.ip}-${Date.now()}`;
      const cart = Cart.findOrCreate({ user_id: req.user?.id, session_id: sessionId });
      const items = Cart.getItems(cart.id);
      const total = Cart.getTotal(cart.id);
      const itemCount = Cart.getItemCount(cart.id);

      res.cookie('cart_session', cart.session_id, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });

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

      res.cookie('cart_session', cart.session_id, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
      res.json({ success: true, data: { cart: { id: cart.id, items, total, itemCount } } });
    } catch (err) { next(err); }
  },

  updateItem(req, res, next) {
    try {
      const { quantity } = req.body;
      const currentCart = Cart.findOrCreate({ user_id: req.user?.id, session_id: req.cookies?.cart_session });
      const item = Cart.getItems(currentCart.id).find((entry) => Number(entry.id) === Number(req.params.itemId));
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cart item not found' } });
      Cart.updateItemQuantity(currentCart.id, parseInt(req.params.itemId), parseInt(quantity));
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
      const currentCart = Cart.findOrCreate({ user_id: req.user?.id, session_id: req.cookies?.cart_session });
      const item = Cart.getItems(currentCart.id).find((entry) => Number(entry.id) === Number(req.params.itemId));
      if (!item) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Cart item not found' } });
      Cart.removeItem(currentCart.id, parseInt(req.params.itemId));
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
