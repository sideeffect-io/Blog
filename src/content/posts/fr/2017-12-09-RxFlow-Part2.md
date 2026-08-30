---
title: RxFlow Partie 2 — En pratique
date: 2017-12-09
description: Il y a quelques semaines, je présentais sur ce blog un framework iOS appelé RxFlow. Après plusieurs mois de travail, il est maintenant prêt à être utilisé. Passons de la théorie à la pratique.
tags: open source, programmation réactive
image: images/2017-12-09-RxFlow-Part2/RxFlow_Logo.png
lang: fr
---

Il y a quelques semaines, je présentais sur ce blog un framework iOS appelé RxFlow. Cela faisait plusieurs mois que je travaillais dessus et il était désormais prêt à être utilisé. Si vous ne l’avez pas encore lu, je vous conseille de commencer par cet [article](/fr/posts/2017-11-08-rxflow-part1/).

Pour résumer, RxFlow vise à :

* faciliter le découpage de votre navigation en sections logiques ;
* retirer le code de navigation des View Controllers ;
* encourager la réutilisabilité des View Controllers ;
* promouvoir la programmation réactive ;
* promouvoir l’injection de dépendances.

Petit rappel de la terminologie :

* Flow : chaque Flow définit une zone de navigation au sein de votre application ;
* Step : chaque Step est un état de navigation dans votre application. Les combinaisons de Flows et de Steps décrivent toutes les actions de navigation possibles ;
* Stepper : il peut s’agir de tout élément capable d’émettre des Steps. Les Steppers déclenchent les actions de navigation au sein des Flows ;
* Presentable : c’est une abstraction de quelque chose qui peut être présenté. En pratique, `UIViewController` et `Flow` sont des Presentables ;
* NextFlowItem : il indique au Coordinator quel sera le prochain élément à produire de nouveaux Steps dans son mécanisme réactif ;
* Coordinator : le rôle du Coordinator est d’associer les combinaisons de Flows et de Steps de manière cohérente.

Il est également important de garder à l’esprit que RxFlow utilise la programmation orientée protocoles afin de ne pas figer votre code dans une hiérarchie d’héritage.

Dans le [dépôt RxFlow](https://github.com/RxSwiftCommunity/RxFlow), vous trouverez une application de démonstration. Elle présente à peu près tous les types de navigation possibles :

* pile de navigation ;
* barre d’onglets ;
* maître/détail ;
* fenêtre modale.

![](/images/2017-12-09-RxFlow-Part2/demo_rxflow.gif)

# Tout est une question d’états

RxFlow consiste principalement à gérer les changements d’état de la navigation de manière réactive. Pour pouvoir être réutilisés dans plusieurs contextes, ces états ne doivent pas connaître le Flow de navigation courant de l’utilisateur. Ainsi, au lieu de signifier « Je veux aller sur cet écran », un état signifie plutôt « Quelqu’un ou quelque chose a effectué cette action ». RxFlow choisit alors le bon écran en fonction du Flow de navigation courant. Dans RxFlow, ces états de navigation sont appelés des Steps.

Les énumérations sont un excellent moyen de décrire les Steps :

* elles sont faciles à utiliser ;
* une valeur ne peut être définie qu’une seule fois, un état est donc unique ;
* elles sont sûres, car Swift vous impose de traiter toutes leurs valeurs possibles dans les instructions `switch` ;
* elles peuvent embarquer des valeurs qui seront transmises d’un écran à l’autre ;
* ce sont des types valeur, il n’existe donc aucune référence partagée qui se propagerait de manière incontrôlée.

Dans l’application de démonstration, voici par exemple tous les Steps dont nous avons besoin pour couvrir les possibilités de navigation.

```swift
import RxFlow

enum DemoStep: Step {
    case apiKey
    case apiKeyIsComplete

    case movieList

    case moviePicked (withMovieId: Int)
    case castPicked (withCastId: Int)

    case settings
    case settingsDone
    case about
}
```

# Suivez le Flow

Avec RxFlow, tout le code de navigation, comme la présentation ou l’empilement de View Controllers, est déclaré dans les Flows. Un Flow représente une section logique de navigation dans votre application. Associé à un Step précis, il déclenche des actions de navigation.

Pour cela, un Flow doit implémenter :

* une fonction `navigate(to:)` qui exécute les actions de navigation en fonction du Flow et du Step ;
* un `UIViewController` racine sur lequel reposera la navigation de ce Flow.

Voici un exemple de Flow qui gère un `UINavigationController` et sa pile de navigation. Trois actions de navigation sont possibles dans ce Flow.

```swift
import RxFlow
import UIKit

class WatchedFlow: Flow {

    var root: UIViewController {
        return self.rootViewController
    }

    private let rootViewController = UINavigationController()
    private let service: MoviesService

    init(withService service: MoviesService) {
        self.service = service
    }

    func navigate(to step: Step) -> [NextFlowItem] {
        guard let step = step as? DemoStep else {
            return NextFlowItem.noNavigation
        }

        switch step {

        case .movieList:
            return navigateToMovieListScreen()
        case .moviePicked(let movieId):
            return navigateToMovieDetailScreen(with: movieId)
        case .castPicked(let castId):
            return navigateToCastDetailScreen(with: castId)
        default:
            return NextFlowItem.noNavigation
        }
    }

    private func navigateToMovieListScreen () -> [NextFlowItem] {
        let viewModel = WatchedViewModel(with: self.service)
        let viewController = WatchedViewController.instantiate(with: viewModel)
        viewController.title = "Watched"
        self.rootViewController.pushViewController(viewController, animated: true)
        return [NextFlowItem(nextPresentable: viewController, nextStepper: viewModel)]
    }

    private func navigateToMovieDetailScreen (with movieId: Int) -> [NextFlowItem] {
        let viewModel = MovieDetailViewModel(withService: self.service, andMovieId: movieId)
        let viewController = MovieDetailViewController.instantiate(with: viewModel)
        viewController.title = viewModel.title
        self.rootViewController.pushViewController(viewController, animated: true)
        return [NextFlowItem(nextPresentable: viewController, nextStepper: viewModel)]
    }

    private func navigateToCastDetailScreen (with castId: Int) -> [NextFlowItem] {
        let viewModel = CastDetailViewModel(withService: self.service, andCastId: castId)
        let viewController = CastDetailViewController.instantiate(with: viewModel)
        viewController.title = viewModel.name
        self.rootViewController.pushViewController(viewController, animated: true)
        return NextFlowItem.noNavigation
    }
}
```

# La navigation est un effet de bord

Lorsque nous apprenons la programmation fonctionnelle réactive, nous lisons souvent des choses sur les effets de bord. Le but de la FRP est de propager des événements et de leur appliquer des fonctions tout au long du parcours. Ces fonctions peuvent transformer les événements et, à la fin — mais pas nécessairement —, exécuter le code qui réalisera la fonctionnalité souhaitée : effectuer un appel réseau, enregistrer un fichier, afficher une alerte… Ce sont des effets de bord.

Comme RxFlow repose sur la programmation réactive, nous pouvons facilement identifier les notions sous-jacentes :

* événements : ce sont les Steps émis ;
* fonction : c’est la fonction `navigate(to:)` ;
* transformation : la fonction `navigate(to:)` transforme un **Step** en `NextFlowItem` ;
* effets de bord : ce sont les actions de navigation exécutées dans `navigate(to:)`. Par exemple, la fonction `navigateToMovieListScreen()` empile un nouveau `UIViewController` dans la pile de navigation.

# Naviguer consiste à produire des NextFlowItems

Un `NextFlowItem` est, au fond, une structure de données simple qui contient un `Presentable` et un `Stepper`.

Un `Presentable` indique au Coordinator quel sera le prochain élément présenté. Un `Stepper` lui indique quel sera le prochain élément à émettre des Steps.

Par défaut, tous les types de `UIViewController` sont des Presentables. Les Flows sont également des Presentables, car vous voudrez à un moment donné lancer une toute nouvelle zone de navigation décrite par son propre Flow. RxFlow la considère donc comme quelque chose qui peut être présenté.

Pourquoi le Coordinator devrait-il connaître les Presentables ?

`Presentable` est une abstraction de quelque chose qui peut être présenté. Comme un Step ne peut pas être émis tant que le Presentable qui lui est associé n’est pas affiché, `Presentable` expose des observables réactifs auxquels le Coordinator s’abonne. Il connaît ainsi l’état de présentation du Presentable. Il n’y a donc aucun risque de déclencher un Step avant que son Presentable ne soit entièrement affiché.

Un Stepper peut être n’importe quoi : un `UIViewController` personnalisé, un ViewModel, un Presenter… Une fois enregistré auprès du Coordinator, un Stepper peut émettre des Steps grâce à sa propriété `step`, qui est un sujet RxSwift. Le Coordinator écoute ces Steps et appelle la fonction `navigate(to:)` du Flow.

Voici un exemple de Stepper dans l’application de démonstration.

```swift
import RxFlow
import RxSwift

class WatchedViewModel: Stepper {

    let movies: [MovieViewModel]

    init(with service: MoviesService) {
        // we can do some data refactoring in order to display
        // things exactly the way we want (this is the aim of a ViewModel)
        self.movies = service.watchedMovies().map({ (movie) -> MovieViewModel in
            return MovieViewModel(id: movie.id,
                                  title: movie.title,
                                  image: movie.image)
        })
    }

    public func pick (movieId: Int) {
        self.step.onNext(DemoStep.moviePicked(withMovieId: movieId))
    }
}
```

Dans cet exemple, la fonction `pick` est appelée lorsque l’utilisateur choisit un film dans une liste. Elle émet une nouvelle valeur dans le flux Rx `self.step`.

Pour résumer le processus de navigation :

* la fonction `navigate(to:)` est appelée avec un Step en paramètre ;
* en fonction de ce Step, du code de navigation est exécuté — ce sont les effets de bord ;
* toujours en fonction de ce Step, des NextFlowItems sont produits. Les Presentables et les Steppers sont alors enregistrés auprès du Coordinator ;
* les Steppers émettent de nouveaux Steps et le cycle recommence.

# Pourquoi peut-on produire plusieurs NextFlowItems pour une seule combinaison de Flow et de Step ?

Parce que rien n’interdit à une application d’avoir plusieurs navigations en parallèle. Par exemple, chaque élément d’une barre d’onglets peut mener à sa propre pile de navigation. Le Step qui déclenche l’affichage du `UITabBarController` produira un `NextFlowItem` par pile de navigation.

Vous pouvez consulter l’application de démonstration pour mieux comprendre ce concept. Voici un extrait dans lequel nous relions un `UITabBarController` à deux Flows. Chaque Flow décrit la pile de navigation associée à un élément de la barre d’onglets :

```swift
private func navigationToDashboardScreen () -> [NextFlowItem] {
    let tabbarController = UITabBarController()
    let wishlistStepper = WishlistStepper()
    let wishListFlow = WishlistWarp(withService: self.service,
                                    andStepper: wishlistStepper)
    let watchedFlow = WatchedFlow(withService: self.service)

    Flows.whenReady(flow1: wishListFlow, flow2: watchedFlow, block: { [unowned self]
    (root1: UINavigationController, root2: UINavigationController) in
        let tabBarItem1 = UITabBarItem(title: "Wishlist",
                                       image: UIImage(named: "wishlist"),
                                       selectedImage: nil)
        let tabBarItem2 = UITabBarItem(title: "Watched",
                                       image: UIImage(named: "watched"),
                                       selectedImage: nil)
        root1.tabBarItem = tabBarItem1
        root1.title = "Wishlist"
        root2.tabBarItem = tabBarItem2
        root2.title = "Watched"

        tabbarController.setViewControllers([root1, root2], animated: false)
        self.rootViewController.pushViewController(tabbarController, animated: true)
    })

    return ([NextFlowItem(nextPresentable: wishListFlow,
                      nextStepper: wishlistStepper),
             NextFlowItem(nextPresentable: watchedFlow,
                      nextStepper: OneStepper(withSingleStep: DemoStep.movieList))])
}
```

La fonction statique `Flows.whenReady()` reçoit les Flows à lancer ainsi qu’une closure appelée lorsqu’ils sont prêts à être affichés, c’est-à-dire lorsque le premier écran de chaque Flow a été choisi.

# Pourquoi peut-on ne produire aucun NextFlowItem pour une combinaison de Flow et de Step ?

Parce qu’un Flow de navigation doit bien avoir une fin ! Le dernier écran d’une pile de navigation, par exemple, ne permettra pas d’aller plus loin : il proposera seulement une action de retour gérée par le `UINavigationController` lui-même. Dans ce cas, la fonction `navigate(to:)` renvoie `NextFlowItem.noNavigation`.

# Ce qui se passe dans un Flow… reste dans ce Flow !

Comme nous l’avons déjà vu, plusieurs Flows peuvent être parcourus en même temps. Un écran situé dans une pile de navigation peut, par exemple, ouvrir une fenêtre modale qui contient elle-même une autre pile de navigation. Du point de vue d’UIKit, la hiérarchie des `UIViewController` est très importante. Nous ne pouvons pas la désorganiser dans le Coordinator.

C’est pourquoi, lorsqu’un Flow n’est pas actuellement affiché — dans notre exemple, lorsque la première pile de navigation se trouve sous la fenêtre modale —, les Steps qui pourraient y être émis sont ignorés par le Coordinator.

Plus généralement, les Steps émis dans le contexte d’un Flow ne sont interprétés que dans ce même contexte. Ils ne peuvent pas être interceptés par d’autres Flows.

# L’injection de dépendances en toute simplicité

L’injection de dépendances est l’un des principaux objectifs de RxFlow. Elle consiste, pour simplifier, à passer l’implémentation de quelque chose — un service, un manager… — en paramètre d’un initialiseur ou d’une méthode. Elle peut aussi se faire par l’intermédiaire d’une propriété.

Dans un Flow RxFlow, le développeur se charge d’instancier les `UIViewController`, ViewModels, Presenters, etc. C’est une excellente occasion d’injecter tout ce dont vous avez besoin. Voici un exemple d’injection de dépendances dans un ViewModel.

```swift
import RxFlow
import UIKit

class WatchedFlow: Flow {

    ...
    private let service: MoviesService

    init(withService service: MoviesService) {
        self.service = service
    }
    ...
    private func navigateToMovieListScreen () -> [NextFlowItem] {
        // inject Service into ViewModel
        let viewModel = WatchedViewModel(with: self.service)

        // injecy ViewMNodel into UIViewController
        let viewController = WatchedViewController.instantiate(with: viewModel)

        viewController.title = "Watched"
        self.rootViewController.pushViewController(viewController, animated: true)
        return [NextFlowItem(nextPresentable: viewController, nextStepper: viewModel)]
    }
    ...
}
```

# Comment amorcer le processus de navigation

Maintenant que vous savez comment relier tous ces éléments, associer Flows et Steps pour déclencher des actions de navigation et produire des NextFlowItems, il ne reste plus qu’une chose à faire : amorcer le processus de navigation au démarrage de l’application.

Tout se passe dans l’`AppDelegate`, et vous allez voir que c’est assez simple :

* instancier le Coordinator ;
* instancier le premier Flow à parcourir ;
* demander au Coordinator de coordonner ce Flow avec un premier Step ;
* lorsque le premier Flow est prêt, utiliser sa racine comme `rootViewController` de la `Window`.

Voici comment cela fonctionne dans l’application de démonstration.

```swift
import UIKit
import RxFlow
import RxSwift
import RxCocoa

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    let disposeBag = DisposeBag()
    var window: UIWindow?
    var coordinator = Coordinator()
    let movieService = MoviesService()
    lazy var mainFlow = {
        return MainFlow(with: self.movieService)
    }()

    func application(_ application: UIApplication,
                     didFinishWithOptions options: [UIApplicationLaunchOptionsKey: Any]?)
                     -> Bool {

        guard let window = self.window else { return false }

        Flows.whenReady(flow: mainFlow, block: { [unowned window] (root) in
            window.rootViewController = root
        })

        coordinator.coordinate(flow: mainFlow,
                               withStepper: OneStepper(withSingleStep: DemoStep.apiKey))

        return true
    }
}
```

# Bonus

Le Coordinator propose deux extensions réactives : `willNavigate` et `didNavigate`. Vous pouvez, par exemple, vous y abonner dans l’`AppDelegate`.

```swift
coordinator.rx.didNavigate.subscribe(onNext: { (flow, step) in
    print ("did navigate to flow=\(flow) and step=\(step)")
}).disposed(by: self.disposeBag)
```

Cela produit des journaux de ce type :

```
did navigate flow=RxFlowDemo.MainFlow step=apiKeyIsComplete
did navigate flow=RxFlowDemo.WishlistFlow step=movieList
did navigate flow=RxFlowDemo.WatchedFlow step=movieList
did navigate flow=RxFlowDemo.WishlistFlow step=moviePicked(23452)
did navigate flow=RxFlowDemo.WishlistFlow step=castPicked(2)
did navigate flow=RxFlowDemo.WatchedFlow step=moviePicked(55423)
did navigate flow=RxFlowDemo.WatchedFlow step=castPicked(5)
did navigate flow=RxFlowDemo.WishlistFlow step=settings
did navigate flow=RxFlowDemo.SettingsFlow step=settings
did navigate flow=RxFlowDemo.SettingsFlow step=apiKey
did navigate flow=RxFlowDemo.SettingsFlow step=about
did navigate flow=RxFlowDemo.SettingsFlow step=apiKey
did navigate flow=RxFlowDemo.SettingsFlow step=settingsDone
```

Cela peut être très utile pour l’analytique et le débogage.

J’espère que ce pattern de Reactive Flow Coordinator vous paraîtra intéressant et utile. N’hésitez pas à contribuer et à remettre mon travail en question : [RxFlow sur GitHub](https://github.com/RxSwiftCommunity/RxFlow).

Le troisième et dernier article consacré à RxFlow présentera les astuces que j’ai utilisées pour implémenter l’ensemble des mécanismes réactifs.

À suivre.
