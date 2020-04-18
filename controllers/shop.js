const Product = require("../models/product");
const Order = require("../models/order");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const stripe = require("stripe")(process.env.STRIPE_KEY);

const ITEMS_PER_PAGE = 40;

exports.getProducts = (req, res, next) => {
  // if user is autheticated , it exists also
  const page = +req.query.page || 1;
  let totalItems;

  Product.find()
    .countDocuments()
    .then((numProducts) => {
      totalItems = numProducts;
      return Product.find()
        .skip((page - 1) * ITEMS_PER_PAGE)
        .limit(ITEMS_PER_PAGE);
    })
    .then((products) => {
      if (req.user) {
        res.render("shop/product-list", {
          prods: products,
          pageTitle: "Products",
          path: "/products",
          currentPage: page,
          hasNextPage: ITEMS_PER_PAGE * page < totalItems,
          hasPreviousPage: page > 1,
          nextPage: page + 1,
          previousPage: page - 1,
          lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE),
          isSeller: req.user.seller,
        });
      } else {
        res.render("shop/product-list", {
          prods: products,
          pageTitle: "Products",
          path: "/products",
          currentPage: page,
          hasNextPage: ITEMS_PER_PAGE * page < totalItems,
          hasPreviousPage: page > 1,
          nextPage: page + 1,
          previousPage: page - 1,
          lastPage: Math.ceil(totalItems / ITEMS_PER_PAGE),
        });
      }
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getProduct = (req, res, next) => {
  const prodId = req.params.productId;
  Product.findById(prodId)
    .then((product) => {
      if (req.user) {
        res.render("shop/product-detail", {
          product: product,
          pageTitle: product.title,
          path: "/products",
          isSeller: req.user.seller,
        });
      } else {
        res.render("shop/product-detail", {
          product: product,
          pageTitle: product.title,
          path: "/products",
        });
      }
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getIndex = (req, res, next) => {
  // if user is autheticated , it exists also
  if (req.user) {
    console.log("Exists");
    res.render("shop/index", {
      pageTitle: "Home",
      path: "/",
      isSeller: req.user.seller,
    });
  } else {
    res.render("shop/index", {
      pageTitle: "Home",
      path: "/",
    });
  }
};
exports.getCart = (req, res, next) => {
  req.user
    .populate("cart.items.productId")
    .execPopulate()
    .then((user) => {
      const isSeller = user.seller;
      const products = user.cart.items;
      res.render("shop/cart", {
        isSeller: isSeller,
        path: "/cart",
        pageTitle: "Your Cart",
        products: products,
      });
    })
    .catch((err) => {
      const error = new Error("Some nasty");
      error.httpStatusCode = 500;
      // skip all middlewares and move to error middleware directly
      return next(error);
    });
};

exports.postCart = (req, res, next) => {
  const prodId = req.body.productId;
  Product.findById(prodId)
    .then((product) => {
      return req.user.addToCart(product);
    })
    .then((result) => {
      console.log(result);
      res.redirect("/cart");
    });
};

exports.postCartDeleteProduct = (req, res, next) => {
  const prodId = req.body.productId;
  req.user
    .removeFromCart(prodId)
    .then((result) => {
      res.redirect("/cart");
    })
    .catch((err) => {
      const error = new Error("Creating a product failed:) ");
      error.httpStatusCode = 500;
      // skip all middlewares and move to error middleware directly
      return next(error);
    });
};

exports.getCheckout = (req, res, next) => {
  let products;
  let total = 0;
  req.user
    .populate("cart.items.productId")
    .execPopulate()
    .then((user) => {
      products = user.cart.items;
      total = 0;
      products.forEach((p) => {
        total += p.quantity * p.productId.price;
      });

      return stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: products.map((p) => {
          return {
            name: p.productId.title,
            description: p.productId.description,
            amount: p.productId.price * 100,
            currency: "usd",
            quantity: p.quantity,
          };
        }),
        success_url:
          req.protocol + "://" + req.get("host") + "/checkout/success", // => http://localhost:3000
        cancel_url: req.protocol + "://" + req.get("host") + "/checkout/cancel",
      });
    })
    .then((session) => {
      res.render("shop/checkout", {
        isSeller: req.user.seller,
        path: "/checkout",
        pageTitle: "Checkout",
        products: products,
        totalSum: total,
        sessionId: session.id,
      });
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      return next(error);
    });
};

exports.getCheckoutSuccess = (req, res, next) => {
  req.user
    .populate("cart.items.productId")
    .execPopulate()
    .then((user) => {
      const products = user.cart.items.map((i) => {
        return { quantity: i.quantity, product: { ...i.productId._doc } };
      });
      const order = new Order({
        user: {
          email: req.user.email,
          userId: req.user,
        },
        products: products,
      });
      return order.save();
    })
    .then((result) => {
      return req.user.clearCart();
    })
    .then(() => {
      res.redirect("/orders");
    })
    .catch((err) => {
      const error = new Error(err);
      error.httpStatusCode = 500;
      // skip all middlewares and move to error middleware directly
      return next(error);
    });
};

exports.getOrders = (req, res, next) => {
  Order.find({ "user.userId": req.user._id })
    .then((orders) => {
      res.render("shop/orders", {
        path: "/orders",
        pageTitle: "Your Orders",
        orders: orders,
        isSeller: req.user.seller,
      });
    })
    .catch((err) => {
      const error = new Error("Creating a product failed:) ");
      error.httpStatusCode = 500;
      // skip all middlewares and move to error middleware directly
      return next(error);
    });
};

exports.getInvoice = (req, res, next) => {
  const orderId = req.params.orderId;
  Order.findById(orderId)
    .then((order) => {
      if (!order) {
        return next(new Error("No order found"));
      }
      if (order.user.userId.toString() !== req.user._id.toString()) {
        return next(new Error("Unauthorised"));
      }

      const invoiceName = "invoice-" + orderId + ".pdf";
      const invoicePath = path.join("data", "invoices", invoiceName);

      const pdfDoc = new PDFDocument();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        'inline ; filename ="' + invoiceName + '"'
      );
      pdfDoc.pipe(fs.createWriteStream(invoicePath));
      pdfDoc.pipe(res);

      pdfDoc
        .fontSize(26)
        .fillColor("red")
        .font("Times-Italic")
        .text(" Customer Invoice", {
          underline: true,
          align: "center",
        });
      pdfDoc
        .fillColor("black")
        .text("------------------------------------------------------");

      let totalPrice = 0;
      order.products.forEach((prod) => {
        totalPrice += prod.quantity * prod.product.price;
        pdfDoc
          .fontSize(14)

          .text(
            prod.product.title +
              " - " +
              prod.quantity +
              "X " +
              prod.product.price +
              "$ "
          );
      });

      pdfDoc
        .fontSize(26)
        .text("------------------------------------------------------");

      pdfDoc.fontSize(14).text("Total Price: $ " + totalPrice);
      pdfDoc.end();
      // fs.readFile(invoicePath, (err, data) => {
      //   if (err) {
      //     return next();
      //   }
      //   res.setHeader("Content-Type", "application/pdf");
      //   res.setHeader(
      //     "Content-Disposition",
      //     'inline ; filename ="' + invoiceName + '"'
      //   );
      //   res.send(data);
      // });
    })
    .catch((err) => {
      next(err);
    });
};
