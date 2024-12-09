// Menu item hover to display image
const menuItems = document.querySelectorAll('.menu-item');
const previewImage = document.getElementById('menu-preview-image');

menuItems.forEach(item => {
    item.addEventListener('mouseenter', () => {
        const imageSrc = item.getAttribute('data-image'); // Get the image path
        previewImage.src = imageSrc; // Set the preview image
        previewImage.classList.add('active'); // Make it visible
    });

    item.addEventListener('mouseleave', () => {
        previewImage.classList.remove('active'); // Hide the image
    });
});

// Contact Form Validation
const contactForm = document.querySelector('.contact-form form');
if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
        const name = this.name.value.trim();
        const email = this.email.value.trim();
        const message = this.message.value.trim();

        if (!name || !email || !message) {
            e.preventDefault();
            alert('Please fill out all fields before submitting.');
        } else if (!validateEmail(email)) {
            e.preventDefault();
            alert('Please enter a valid email address.');
        }
    });

    // Email Validation Function
    function validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const events = document.querySelectorAll('.event');
    events.forEach(event => {
        // Assign a random animation delay between 0 and 2 seconds
        const randomDelay = Math.random() * 2;
        event.style.animationDelay = `${randomDelay}s`;

        // Add event listener to stop animation on hover
        event.addEventListener('mouseenter', () => {
            event.style.animation = 'none';
        });

        // Resume animation when the cursor leaves
        event.addEventListener('mouseleave', () => {
            event.style.animation = `bounce 2s infinite`;
        });
    });
});

document.addEventListener('DOMContentLoaded', () => {
        const galleryImages = document.querySelectorAll('.gallerywrapperimage');
        const imagePopup = document.getElementById('image-popup');
        const popupImage = document.getElementById('popup-image');

        // Ensure the popup is hidden by default
        imagePopup.style.display = 'none';

        galleryImages.forEach(image => {
            image.addEventListener('click', () => {
                popupImage.src = image.src;
                imagePopup.style.display = 'flex';
            });
        });

        imagePopup.addEventListener('click', () => {
            imagePopup.style.display = 'none';
            popupImage.src = ''; // Clear the image source
        });
});

let cart = [];
let totalPrice = 0;

function addToCart(productName, productPrice) {
    // Add product to cart
    cart.push({ name: productName, price: productPrice });
    totalPrice += productPrice;
    updateCart();
}

function updateCart() {
    const cartItems = document.getElementById('cart-items');
    const totalPriceElement = document.getElementById('total-price');

    // Clear current cart items
    cartItems.innerHTML = '';

    // Add each item to the cart display
    cart.forEach(item => {
        const li = document.createElement('li');
        li.textContent = `${item.name} - €${item.price.toFixed(2)}`;
        cartItems.appendChild(li);
    });

    // Update total price
    totalPriceElement.textContent = `Total: €${totalPrice.toFixed(2)}`;
}

function checkout() {
    if (cart.length === 0) {
        alert('Your cart is empty!');
        return;
    }
    alert('Thank you for your purchase!');
    // Reset cart
    cart = [];
    totalPrice = 0;
    updateCart();
}